import { NextResponse } from 'next/server';
import { getCadRates } from '@/lib/cadRate';
import { fetchAllSources } from '@/lib/combine';
import { listLabels } from '@/lib/labels';
import type { CostBasisMethod, GainResult, UnrealizedGain } from '@/lib/accounting/types';
import type { ApiResult, SourcedGainResult, TaxRow } from '@/lib/types';
import { gainRowId } from '@/lib/types';
import { WALLET_KEYS, WALLET_LABELS, type WalletKey } from '@/lib/wallets';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];

interface UpstreamGains {
  method: CostBasisMethod;
  realized: GainResult[];
  unrealized: UnrealizedGain[];
}

export interface SourcedUnrealizedGain extends UnrealizedGain {
  wallet: WalletKey;
}

export interface TaxesResponse {
  method: CostBasisMethod;
  realized: TaxRow[];
  unrealized: SourcedUnrealizedGain[];
}

function parseWallet(request: Request): WalletKey | undefined {
  const param = new URL(request.url).searchParams.get('wallet');
  return WALLET_KEYS.includes(param as WalletKey) ? (param as WalletKey) : undefined;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const methodParam = searchParams.get('method');
  const method = METHODS.includes(methodParam as CostBasisMethod) ? (methodParam as CostBasisMethod) : 'fifo';
  const walletFilter = parseWallet(request);

  const results = await fetchAllSources<UpstreamGains>(`/api/gains?method=${method}`);

  if (results.every((r) => r.data === null)) {
    const rateLimited = results.every((r) => r.rateLimited);
    return NextResponse.json(
      { error: results[0]?.error ?? 'Failed to load any wallet gains', rateLimited } satisfies ApiResult<TaxesResponse>,
      { status: rateLimited ? 429 : 502 },
    );
  }

  let realizedSourced: SourcedGainResult[] = results.flatMap((r) => (r.data?.realized ?? []).map((g) => ({ ...g, wallet: r.source.key })));
  let unrealized: SourcedUnrealizedGain[] = results.flatMap((r) => (r.data?.unrealized ?? []).map((g) => ({ ...g, wallet: r.source.key })));

  if (walletFilter) {
    realizedSourced = realizedSourced.filter((g) => g.wallet === walletFilter);
    unrealized = unrealized.filter((g) => g.wallet === walletFilter);
  }

  // CAD conversion: CRA's own guidance is to convert each leg at its own date's rate, not one
  // blended average - so both the acquisition date (cost basis) and disposition date (proceeds)
  // are looked up independently. See lib/cadRate.ts.
  const allDates = realizedSourced.flatMap((g) => [g.acquiredAt, g.disposedAt]);
  const [rates, labels] = await Promise.all([getCadRates(allDates), listLabels()]);

  const realized: TaxRow[] = realizedSourced.map((g) => {
    const id = gainRowId(g);
    const rAcq = rates.get(g.acquiredAt.slice(0, 10)) ?? null;
    const rDisp = rates.get(g.disposedAt.slice(0, 10)) ?? null;
    return {
      ...g,
      id,
      walletLabel: WALLET_LABELS[g.wallet],
      cadRateAcquired: rAcq,
      cadRateDisposed: rDisp,
      costBasisCad: rAcq !== null ? g.costBasisUsd * rAcq : null,
      proceedsCad: rDisp !== null ? g.proceedsUsd * rDisp : null,
      gainCad: rAcq !== null && rDisp !== null ? g.proceedsUsd * rDisp - g.costBasisUsd * rAcq : null,
      label: labels[id] ?? null,
    };
  });

  return NextResponse.json({ data: { method, realized, unrealized } } satisfies ApiResult<TaxesResponse>);
}
