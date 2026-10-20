'use client';

import FreshNote from '@/components/FreshNote';
import { useAssetsTotal } from '@/hooks/useAssetsTotal';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * The overview's total: mes.fm/assets' grand total over every wallet and account (the cards below are
 * parts of it). The per-group split was dropped on request (2026-10-19, "keep everything simple");
 * it is on mes.fm/assets.
 */
export default function AssetsTotalCard() {
  const { assets, isLoading, error, savedAt, updating } = useAssetsTotal();

  return (
    <a href="https://mes.fm/assets" className="panel block transition hover:border-accent">
      <div className="flex items-center justify-between">
        <p className="stat-label">Total &middot; everything you hold</p>
        <span className="text-xs text-accent">mes.fm/assets &rarr;</span>
      </div>
      {isLoading && <p className="mt-2 text-sm text-gray-400">Loading&hellip;</p>}
      {error && !assets && <p className="mt-2 text-sm text-loss">{error}</p>}
      {assets && (
        <>
          <FreshNote savedAt={savedAt} updating={updating} error={error} />
          <p className="mt-1 text-3xl font-semibold">{formatUsd(assets.totalAllUsd)}</p>
          <p className="mt-1 text-xs text-gray-500">
            Every wallet and account (Random Wallets not included) &middot; updated {new Date(assets.fetchedAt).toLocaleTimeString()} &middot; the
            breakdown is on mes.fm/assets
          </p>
        </>
      )}
    </a>
  );
}
