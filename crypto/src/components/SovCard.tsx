'use client';

import useSWR from 'swr';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { SovSnapshot } from '@/lib/types';

const usd = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/** The overview's Store of Value card - same data as mes.fm/sov (Bitcoin in every form, XRP, TGLD, from mes.fm/assets) */
export default function SovCard() {
  const { data, error, isLoading } = useSWR(`${BASE_PATH}/api/sov`, (url: string) => fetchApiResult<SovSnapshot>(url));

  return (
    <a href="https://mes.fm/sov" className="panel block transition hover:border-accent">
      <div className="flex items-center justify-between">
        <p className="stat-label">Store of Value · every wallet</p>
        <span className="text-xs text-accent">View dashboard &rarr;</span>
      </div>
      {isLoading && <p className="mt-2 text-sm text-gray-400">Loading&hellip;</p>}
      {error && !data && <p className="mt-2 text-sm text-loss">{error instanceof Error ? error.message : 'Unavailable'}</p>}
      {data && (
        <>
          <p className="mt-1 text-2xl font-semibold">{usd(data.totalUsd)}</p>
          <p className="mt-1 text-sm text-gray-400">
            {data.assets.map((a) => `${a.amount.toLocaleString('en-US', { maximumFractionDigits: a.asset === 'BTC' ? 6 : 1 })} ${a.asset}`).join(' · ')}
          </p>
        </>
      )}
    </a>
  );
}
