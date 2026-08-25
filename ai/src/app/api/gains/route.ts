import { NextResponse } from 'next/server';
import { computeRealizedGains, computeUnrealizedGains } from '@/lib/accounting/engine';
import type { CostBasisMethod, GainResult, UnrealizedGain } from '@/lib/accounting/types';
import { NETWORKS, type NetworkId } from '@/lib/config';
import { apiErrorResponse, describeNetworkError } from '@/lib/errors';
import { buildLotsAndDisposalsByNetwork, getCurrentHoldings, getHyperliquidPerpSummary } from '@/lib/ledger';
import type { HyperliquidPerpSummary } from '@/lib/networks/types';
import type { ApiResult, NetworkError } from '@/lib/types';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];

export interface GainsResponse {
  method: CostBasisMethod;
  realized: GainResult[];
  unrealized: UnrealizedGain[];
  /** Hyperliquid perpetuals P&L - separate from the FIFO-based realized/unrealized above (see networks/hyperliquid.ts), informational only */
  hyperliquidPerps?: HyperliquidPerpSummary;
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

    let hyperliquidPerps: HyperliquidPerpSummary | undefined;
    const mergedErrors: Partial<Record<NetworkId, NetworkError>> = { ...networkErrors };
    if (!network || network === 'hyperliquid') {
      try {
        hyperliquidPerps = await getHyperliquidPerpSummary();
      } catch (err) {
        mergedErrors.hyperliquid = describeNetworkError(err, 'Failed to load Hyperliquid perpetuals data');
      }
    }

    return NextResponse.json({
      data: { method, realized, unrealized, hyperliquidPerps },
      networkErrors: mergedErrors,
    } satisfies ApiResult<GainsResponse>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to compute gains');
  }
}
