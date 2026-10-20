'use client';

import FreshNote from '@/components/FreshNote';
import { useStoredThenLive } from '@/hooks/useStoredThenLive';
import type { LpSnapshot } from '@/lib/types';

const usd = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** The overview's Liquidity card - same data as mes.fm/lp (the Main wallet's PancakeSwap position + unharvested CAKE) */
export default function LpCard() {
  const { data, error, isLoading, savedAt, updating } = useStoredThenLive<LpSnapshot>('/api/lp');

  return (
    <a href="https://mes.fm/lp" className="panel block transition hover:border-accent">
      <div className="flex items-center justify-between">
        <p className="stat-label">Liquidity · PancakeSwap</p>
        <span className="text-xs text-accent">View dashboard &rarr;</span>
      </div>
      {isLoading && <p className="mt-2 text-sm text-gray-400">Loading&hellip;</p>}
      {error && !data && <p className="mt-2 text-sm text-loss">{error}</p>}
      {data && (
        <>
          <FreshNote savedAt={savedAt} updating={updating} error={error} />
          <p className="mt-1 text-2xl font-semibold">{usd(data.totalUsd)}</p>
          <p className="mt-1 text-sm text-gray-400">
            {data.positions.length ? data.positions.map((p) => p.label).join(' · ') : 'No open positions'}
          </p>
        </>
      )}
    </a>
  );
}
