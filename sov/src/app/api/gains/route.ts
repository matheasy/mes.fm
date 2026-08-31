import { NextResponse } from 'next/server';
import { computeRealizedGains, computeUnrealizedGains } from '@/lib/accounting/engine';
import type { CostBasisMethod, GainResult, UnrealizedGain } from '@/lib/accounting/types';
import { NETWORKS, type NetworkId } from '@/lib/config';
import { apiErrorResponse } from '@/lib/errors';
import { buildLotsAndDisposalsByNetwork, getCurrentHoldings } from '@/lib/ledger';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];

export interface GainsResponse {
  method: CostBasisMethod;
  realized: GainResult[];
  unrealized: UnrealizedGain[];
}

function parseNetwork(request: Request): NetworkId | undefined {
  const param = new URL(request.url).searchParams.get('network');
  return NETWORKS.includes(param as NetworkId) ? (param as NetworkId) : undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const methodParam = searchParams.get('method');
    const method = METHODS.includes(methodParam as CostBasisMethod) ? (methodParam as CostBasisMethod) : 'fifo';
    const network = parseNetwork(request);

    const [{ byNetwork, networkErrors }, { holdings }] = await Promise.all([
      buildLotsAndDisposalsByNetwork(network),
      getCurrentHoldings(network),
    ]);

    const pricesByNetwork = new Map<NetworkId, Record<string, number>>();
    for (const h of holdings) {
      if (h.priceUsd === null) continue;
      const map = pricesByNetwork.get(h.token.network) ?? {};
      map[h.token.contractAddress] = h.priceUsd;
      pricesByNetwork.set(h.token.network, map);
    }

    const realized: GainResult[] = [];
    const unrealized: UnrealizedGain[] = [];
    for (const nl of byNetwork) {
      realized.push(...computeRealizedGains(nl.lots, nl.disposals, method));
      unrealized.push(...computeUnrealizedGains(nl.lots, nl.disposals, method, pricesByNetwork.get(nl.network) ?? {}));
    }

    return NextResponse.json({
      data: { method, realized, unrealized },
      networkErrors,
    } satisfies ApiResult<GainsResponse>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to compute gains');
  }
}
