import type { WalletPortfolio } from '@/lib/types';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function WalletBreakdown({ wallets }: { wallets: WalletPortfolio[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {wallets.map((w) => {
        const isPositive = w.change24hUsd >= 0;
        const loadedOk = w.wallet !== null;

        return (
          <a key={w.key} href={w.linkPath} className="panel block transition hover:border-accent">
            <div className="flex items-center justify-between">
              <p className="stat-label">{w.label}</p>
              <span className="text-xs text-accent">View dashboard &rarr;</span>
            </div>
            {loadedOk ? (
              <>
                <p className="mt-1 text-2xl font-semibold">{formatUsd(w.totalValueUsd)}</p>
                <p className={`mt-1 text-sm ${isPositive ? 'text-gain' : 'text-loss'}`}>
                  {isPositive ? '+' : ''}
                  {formatUsd(w.change24hUsd)} ({isPositive ? '+' : ''}
                  {w.change24hPct.toFixed(2)}%) 24h
                </p>
                <p className="mt-3 truncate text-xs text-gray-500">{w.wallet}</p>
                {w.error && <p className="mt-1 text-xs text-loss">{w.error}</p>}
              </>
            ) : (
              <p className="mt-2 text-sm text-loss">{w.error ?? 'Unavailable'}</p>
            )}
          </a>
        );
      })}
    </div>
  );
}
