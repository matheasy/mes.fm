import { NextResponse } from 'next/server';
import { NETWORKS, WALLET_ADDRESS, type NetworkId } from '@/lib/config';
import { apiErrorResponse } from '@/lib/errors';
import { getCurrentHoldings } from '@/lib/ledger';
import type { ApiResult, PortfolioSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

function parseNetwork(request: Request): NetworkId | undefined {
  const param = new URL(request.url).searchParams.get('network');
  return NETWORKS.includes(param as NetworkId) ? (param as NetworkId) : undefined;
}

export async function GET(request: Request) {
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
      wallet: WALLET_ADDRESS,
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
}
