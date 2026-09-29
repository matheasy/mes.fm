import { NextResponse } from 'next/server';
import { computeRealizedGains, computeUnrealizedGains } from '@/apps/ai/lib/accounting/engine';
import type { CostBasisMethod, GainResult, UnrealizedGain } from '@/apps/ai/lib/accounting/types';
import { NETWORKS, type NetworkId } from '@/apps/ai/lib/config';
import { apiErrorResponse, describeNetworkError } from '@/apps/ai/lib/errors';
import { buildLotsAndDisposalsByNetwork, getCurrentHoldings, getHyperliquidPerpSummary } from '@/apps/ai/lib/ledger';
import type { HyperliquidPerpSummary } from '@/apps/ai/lib/networks/types';
import type { ApiResult, NetworkError } from '@/apps/ai/lib/types';
import { withWallet } from '@/apps/ai/lib/walletContext';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  return withWallet(request, async () => {
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
  });
}
