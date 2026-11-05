'use client';

import FreshNote from '@/components/FreshNote';
import StateView from '@/components/StateView';
import { money } from '@/components/TaxSummary';
import { useStoredThenLive } from '@/hooks/useStoredThenLive';
import type { BucketItem, BucketSnapshot } from '@/lib/types';

const CHAINS: Record<string, string> = {
  bsc: 'BNB Chain', ethereum: 'Ethereum', polygon: 'Polygon', arbitrum: 'Arbitrum', base: 'Base', optimism: 'Optimism',
  hyperliquid: 'Hyperliquid', 'hive-engine': 'Hive Engine', magi: 'Magi', 'hive-l1': 'Hive', xrpl: 'XRP Ledger', bitcoin: 'Bitcoin',
};
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 2 : 6 });

function ItemCard({ it, rate }: { it: BucketItem; rate: number | null }) {
  return (
    <div className="panel flex flex-col gap-3">
      <div>
        <p className="stat-label">{it.name}</p>
        <p className="mt-1 text-2xl font-semibold">{money(it.valueUsd, 'USD')}</p>
        <p className="text-sm text-gray-400">
          {it.amount !== null && (
            <>
              {qty(it.amount)} {it.key}
            </>
          )}
          {rate && <span className="text-gray-500">{it.amount !== null ? ' · ' : ''}{money(it.valueUsd * rate, 'CAD')}</span>}
        </p>
        {it.parUsd !== undefined && (
          <p className="mt-1 text-sm text-yellow-300">At its $1 par value: {money(it.parUsd, 'USD')} (not counted)</p>
        )}
      </div>
      {it.legs && it.legs.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {it.legs.map((l) => (
            <li key={l.symbol} className="flex justify-between gap-3 border-b border-bg-border/60 py-1">
              <span className="text-gray-300">
                {qty(l.amount)} {l.symbol}
              </span>
              <span className="tabular-nums">{l.valueUsd === null ? '—' : money(l.valueUsd, 'USD')}</span>
            </li>
          ))}
        </ul>
      )}
      {(it.amount !== null || it.lines.length > 1) && (
        <ul className="flex flex-col gap-1 text-sm">
          {it.lines.map((l, i) => (
            <li key={`${l.where}-${l.label}-${i}`} className="flex justify-between gap-3 border-b border-bg-border/60 py-1">
              <span className="min-w-0 truncate text-gray-300">
                {l.label}{' '}
                <span className="text-gray-500">
                  · {l.where}
                  {CHAINS[l.source] && !l.where.startsWith('Hive') ? ` (${CHAINS[l.source]})` : ''}
                </span>
              </span>
              <span className="whitespace-nowrap tabular-nums">{l.valueUsd === null ? qty(l.amount) : money(l.valueUsd, 'USD')}</span>
            </li>
          ))}
        </ul>
      )}
      {it.note && <p className="text-xs text-gray-500">{it.note}</p>}
    </div>
  );
}

/** mes.fm/cash and mes.fm/tokens: a total, then one card per asset (summed across wallets) */
export default function BucketView({ path, totalLabel, intro }: { path: string; totalLabel: string; intro: React.ReactNode }) {
  const { data, error: liveError, isLoading, refresh, savedAt, updating } = useStoredThenLive<BucketSnapshot>(path);
  const rate = data?.cadRate ?? null;
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">{intro}</p>
      <FreshNote savedAt={savedAt} updating={updating} error={liveError} />
      <StateView loading={isLoading} error={liveError && !data ? liveError : null} onRetry={() => refresh()}>
        {data && (
          <div className="flex flex-col gap-6">
            <div className="panel">
              <p className="stat-label">{totalLabel}</p>
              <p className="mt-1 text-3xl font-semibold">{money(data.totalUsd, 'USD')}</p>
              {rate && <p className="mt-1 text-sm text-gray-400">{money(data.totalUsd * rate, 'CAD')} at today&apos;s Bank of Canada rate</p>}
              <p className="mt-2 text-xs text-gray-500">
                Balances as of {new Date(data.fetchedAt).toLocaleString()}
                {data.hidden && data.hidden.count > 0 && (
                  <>
                    {' '}
                    · {data.hidden.count} smaller token{data.hidden.count === 1 ? '' : 's'} under $10 each ({money(data.hidden.usd, 'USD')} together) not listed or
                    counted
                  </>
                )}
              </p>
            </div>
            {data.items.length === 0 ? (
              <div className="panel py-10 text-center text-gray-400">Nothing here right now.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-3">
                {data.items.map((it) => (
                  <ItemCard key={it.key} it={it} rate={rate} />
                ))}
              </div>
            )}
          </div>
        )}
      </StateView>
    </div>
  );
}

/** Overview card for /portfolio (same data as the page) */
export function BucketCard({ path, href, label }: { path: string; href: string; label: string }) {
  const { data, error, isLoading, savedAt, updating } = useStoredThenLive<BucketSnapshot>(path);
  return (
    <a href={href} className="panel block transition hover:border-accent">
      <div className="flex items-center justify-between">
        <p className="stat-label">{label}</p>
        <span className="text-xs text-accent">View dashboard &rarr;</span>
      </div>
      {isLoading && <p className="mt-2 text-sm text-gray-400">Loading&hellip;</p>}
      {error && !data && <p className="mt-2 text-sm text-loss">{error}</p>}
      {data && (
        <>
          <FreshNote savedAt={savedAt} updating={updating} error={error} />
          <p className="mt-1 text-2xl font-semibold">{money(data.totalUsd, 'USD')}</p>
          <p className="mt-1 text-sm text-gray-400">
            {data.items
              .slice(0, 6)
              .map((i) => (i.amount === null ? i.key : `${qty(i.amount)} ${i.key}`))
              .join(' · ')}
            {data.items.length > 6 ? ` · +${data.items.length - 6} more` : ''}
          </p>
        </>
      )}
    </a>
  );
}
