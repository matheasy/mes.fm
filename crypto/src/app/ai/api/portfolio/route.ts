import { NextResponse } from 'next/server';
import { NETWORKS, type NetworkId } from '@/apps/ai/lib/config';
import { apiErrorResponse } from '@/apps/ai/lib/errors';
import { getCurrentHoldings } from '@/apps/ai/lib/ledger';
import type { ApiResult, PortfolioSummary } from '@/apps/ai/lib/types';
import { currentWallet, withWallet } from '@/apps/ai/lib/walletContext';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function parseNetwork(request: Request): NetworkId | undefined {
  const param = new URL(request.url).searchParams.get('network');
  return NETWORKS.includes(param as NetworkId) ? (param as NetworkId) : undefined;
}

export async function GET(request: Request) {
  return withWallet(request, async () => {
    try {
      const network = parseNetwork(request);
      const { holdings, networkErrors } = await getCurrentHoldings(network);

      const totalValueUsd = holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
      const change24hUsd = holdings.reduce((sum, h) => {
        if (h.valueUsd === null || h.change24hPct === null) return sum;
        const previousValue = h.valueUsd / (1 + h.change24hPct / 100);
        return sum + (h.valueUsd - previousValue);
      }, 0);

      const summary: PortfolioSummary = {
        wallet: currentWallet().address,
        totalValueUsd,
        change24hUsd,
        change24hPct: totalValueUsd > change24hUsd ? (change24hUsd / (totalValueUsd - change24hUsd)) * 100 : 0,
        holdings,
        fetchedAt: new Date().toISOString(),
      };

      return NextResponse.json({ data: summary, networkErrors } satisfies ApiResult<PortfolioSummary>);
    } catch (err) {
      return apiErrorResponse(err, 'Failed to load portfolio');
    }
  });
}
