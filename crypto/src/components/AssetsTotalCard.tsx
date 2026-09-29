'use client';

import { useAssetsTotal } from '@/hooks/useAssetsTotal';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * "All assets" card on the overview: mes.fm/assets' grand total with its per-group split. Kept
 * separate from the trading-wallet total above because it already includes those wallets (and
 * everything else: Hive, the Main wallet, XRP, native BTC), so adding the two would double count.
 */
export default function AssetsTotalCard() {
  const { assets, isLoading, error } = useAssetsTotal();

  return (
    <a href="https://mes.fm/assets" className="panel block transition hover:border-accent">
      <div className="flex items-center justify-between">
        <p className="stat-label">All assets &middot; every wallet and account</p>
        <span className="text-xs text-accent">mes.fm/assets &rarr;</span>
      </div>
      {isLoading && <p className="mt-2 text-sm text-gray-400">Loading&hellip;</p>}
      {error && !assets && <p className="mt-2 text-sm text-loss">{error}</p>}
      {assets && (
        <>
          <p className="mt-1 text-3xl font-semibold">{formatUsd(assets.totalAllUsd)}</p>
          <p className="mt-1 text-xs text-gray-500">
            Includes the three trading wallets above &middot; {formatUsd(assets.totalUsd)} in holdings worth $10+ &middot; updated{' '}
            {new Date(assets.fetchedAt).toLocaleTimeString()}
          </p>
          <ul className="mt-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {assets.groups.map((g) => (
              <li key={g.key} className="flex justify-between gap-3 border-b border-bg-border/60 py-1">
                <span className="truncate text-gray-300">{g.label}</span>
                <span className="tabular-nums">{formatUsd(g.totalUsd)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </a>
  );
}
