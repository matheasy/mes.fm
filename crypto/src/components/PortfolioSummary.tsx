import type { CombinedPortfolio } from '@/lib/types';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function PortfolioSummary({ summary }: { summary: CombinedPortfolio }) {
  const isPositive = summary.change24hUsd >= 0;

  return (
    <div className="panel">
      <p className="stat-label">Total Portfolio Value</p>
      <p className="mt-1 text-3xl font-semibold">{formatUsd(summary.totalValueUsd)}</p>
      <p className={`mt-1 text-sm ${isPositive ? 'text-gain' : 'text-loss'}`}>
        {isPositive ? '+' : ''}
        {formatUsd(summary.change24hUsd)} ({isPositive ? '+' : ''}
        {summary.change24hPct.toFixed(2)}%) 24h
      </p>
      <p className="mt-3 text-xs text-gray-500">
        {summary.wallets.length} wallets combined · updated {new Date(summary.fetchedAt).toLocaleTimeString()}
      </p>
    </div>
  );
}
