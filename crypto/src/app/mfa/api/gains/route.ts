import { NextResponse } from 'next/server';
import { computeRealizedGains, computeUnrealizedGains } from '@/apps/mfa/lib/accounting/engine';
import type { CostBasisMethod, GainResult, UnrealizedGain } from '@/apps/mfa/lib/accounting/types';
import { apiErrorResponse } from '@/apps/mfa/lib/errors';
import { getCurrentHoldings, buildLotsAndDisposals } from '@/apps/mfa/lib/ledger';
import type { ApiResult } from '@/apps/mfa/lib/types';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];

export interface GainsResponse {
  method: CostBasisMethod;
  realized: GainResult[];
  unrealized: UnrealizedGain[];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const methodParam = searchParams.get('method');
    const method = METHODS.includes(methodParam as CostBasisMethod) ? (methodParam as CostBasisMethod) : 'fifo';

    const [{ lots, disposals }, holdings] = await Promise.all([buildLotsAndDisposals(), getCurrentHoldings()]);

    const currentPricesBySymbol: Record<string, number> = {};
    for (const h of holdings) {
      if (h.priceUsd !== null) currentPricesBySymbol[h.token.symbol] = h.priceUsd;
    }

    const realized = computeRealizedGains(lots, disposals, method);
    const unrealized = computeUnrealizedGains(lots, disposals, method, currentPricesBySymbol);

    return NextResponse.json({ data: { method, realized, unrealized } } satisfies ApiResult<GainsResponse>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to compute gains');
  }
}
