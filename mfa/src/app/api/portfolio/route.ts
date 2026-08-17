import { NextResponse } from 'next/server';
import { WALLET_ADDRESS } from '@/lib/config';
import { getCurrentHoldings } from '@/lib/ledger';
import type { ApiResult, PortfolioSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const holdings = await getCurrentHoldings();
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

    return NextResponse.json({ data: summary } satisfies ApiResult<PortfolioSummary>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load portfolio';
    return NextResponse.json({ error: message } satisfies ApiResult<PortfolioSummary>, { status: 502 });
  }
}
