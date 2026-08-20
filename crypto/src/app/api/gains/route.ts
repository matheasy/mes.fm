import { NextResponse } from 'next/server';
import { fetchAllSources } from '@/lib/combine';
import type { CostBasisMethod, GainResult, UnrealizedGain } from '@/lib/accounting/types';
import type { ApiResult } from '@/lib/types';
import type { WalletKey } from '@/lib/wallets';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];

interface UpstreamGains {
  method: CostBasisMethod;
  realized: GainResult[];
  unrealized: UnrealizedGain[];
}

export interface SourcedGainResult extends GainResult {
  wallet: WalletKey;
}

export interface SourcedUnrealizedGain extends UnrealizedGain {
  wallet: WalletKey;
}

export interface CombinedGainsResponse {
  method: CostBasisMethod;
  realized: SourcedGainResult[];
  unrealized: SourcedUnrealizedGain[];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const methodParam = searchParams.get('method');
  const method = METHODS.includes(methodParam as CostBasisMethod) ? (methodParam as CostBasisMethod) : 'fifo';

  const results = await fetchAllSources<UpstreamGains>(`/api/gains?method=${method}`);

  if (results.every((r) => r.data === null)) {
    const rateLimited = results.every((r) => r.rateLimited);
    return NextResponse.json(
      { error: results[0]?.error ?? 'Failed to load any wallet gains', rateLimited } satisfies ApiResult<CombinedGainsResponse>,
      { status: rateLimited ? 429 : 502 },
    );
  }

  const realized = results.flatMap((r) => (r.data?.realized ?? []).map((g) => ({ ...g, wallet: r.source.key })));
  const unrealized = results.flatMap((r) => (r.data?.unrealized ?? []).map((g) => ({ ...g, wallet: r.source.key })));

  return NextResponse.json({ data: { method, realized, unrealized } } satisfies ApiResult<CombinedGainsResponse>);
}
