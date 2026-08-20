import { NextResponse } from 'next/server';
import { fetchAllSources } from '@/lib/combine';
import type { ApiResult, CombinedPortfolio, Holding, PortfolioSummary, WalletPortfolio } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results = await fetchAllSources<PortfolioSummary>('/api/portfolio');

  if (results.every((r) => r.data === null)) {
    const rateLimited = results.every((r) => r.rateLimited);
    return NextResponse.json(
      { error: results[0]?.error ?? 'Failed to load any wallet', rateLimited } satisfies ApiResult<CombinedPortfolio>,
      { status: rateLimited ? 429 : 502 },
    );
  }

  const wallets: WalletPortfolio[] = results.map(({ source, data, error, rateLimited }) => ({
    key: source.key,
    label: source.label,
    linkPath: source.linkPath,
    wallet: data?.wallet ?? null,
    totalValueUsd: data?.totalValueUsd ?? 0,
    change24hUsd: data?.change24hUsd ?? 0,
    change24hPct: data?.change24hPct ?? 0,
    fetchedAt: data?.fetchedAt ?? null,
    error,
    rateLimited,
  }));

  const totalValueUsd = wallets.reduce((sum, w) => sum + w.totalValueUsd, 0);
  const change24hUsd = wallets.reduce((sum, w) => sum + w.change24hUsd, 0);
  const previousValueUsd = totalValueUsd - change24hUsd;
  const change24hPct = previousValueUsd > 0 ? (change24hUsd / previousValueUsd) * 100 : 0;

  const holdingsBySymbol = new Map<string, Holding>();
  for (const r of results) {
    for (const h of r.data?.holdings ?? []) {
      const existing = holdingsBySymbol.get(h.token.symbol);
      if (!existing) {
        holdingsBySymbol.set(h.token.symbol, { ...h });
        continue;
      }
      existing.balanceFormatted += h.balanceFormatted;
      if (existing.valueUsd !== null || h.valueUsd !== null) {
        existing.valueUsd = (existing.valueUsd ?? 0) + (h.valueUsd ?? 0);
      }
    }
  }

  const combined: CombinedPortfolio = {
    totalValueUsd,
    change24hUsd,
    change24hPct,
    fetchedAt: new Date().toISOString(),
    wallets,
    holdings: Array.from(holdingsBySymbol.values()).sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)),
  };

  return NextResponse.json({ data: combined } satisfies ApiResult<CombinedPortfolio>);
}
