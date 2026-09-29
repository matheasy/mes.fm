'use client';

import useSWR from 'swr';
import StateView from '@/components/StateView';
import { money } from '@/components/TaxSummary';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { LpSnapshot } from '@/lib/types';

const qty = (n: number, d = 6) => n.toLocaleString('en-US', { maximumFractionDigits: d });
const TYPE_LABELS = { added: 'Added liquidity', removed: 'Removed liquidity', harvest: 'Harvested rewards' } as const;

/**
 * mes.fm/lp - Liquidity providing: the Main wallet's PancakeSwap position(s) on BNB Chain, what's
 * waiting to be harvested, and every add / removal / harvest. A view like Store of Value: balances
 * from the Assets section, history from the Main wallet's ledger; taxes on it are on mes.fm/taxes.
 */
export default function LiquidityPage() {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/lp`, (url: string) => fetchApiResult<LpSnapshot>(url));
  const rate = data?.cadRate ?? null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">
        Your liquidity providing: the Main wallet&apos;s PancakeSwap position on BNB Chain, its unharvested CAKE, and every time you added or
        removed liquidity. How it&apos;s taxed (adding counts as disposing of the two coins, removing as acquiring them again, CAKE rewards as
        income) is on{' '}
        <a href="https://mes.fm/taxes" className="text-accent hover:underline">
          mes.fm/taxes
        </a>
        .
      </p>

      <StateView loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={() => mutate()}>
        {data && (
          <div className="flex flex-col gap-6">
            <div className="panel">
              <p className="stat-label">Liquidity total</p>
              <p className="mt-1 text-3xl font-semibold">{money(data.totalUsd, 'USD')}</p>
              {rate && <p className="mt-1 text-sm text-gray-400">{money(data.totalUsd * rate, 'CAD')} at today&apos;s Bank of Canada rate</p>}
              <p className="mt-2 text-xs text-gray-500">Balances as of {new Date(data.fetchedAt).toLocaleString()}</p>
            </div>

            {data.positions.length === 0 ? (
              <div className="panel py-10 text-center text-gray-400">No open liquidity positions right now.</div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {data.positions.map((p) => (
                  <div key={p.label + (p.detail ?? '')} className="panel flex flex-col gap-3">
                    <div>
                      <p className="stat-label">{p.label}</p>
                      <p className="mt-1 text-2xl font-semibold">{p.valueUsd === null ? '—' : money(p.valueUsd, 'USD')}</p>
                      {p.detail && <p className="text-xs text-gray-500">{p.detail}</p>}
                    </div>
                    <ul className="flex flex-col gap-1 text-sm">
                      {p.legs.map((l) => (
                        <li key={l.symbol} className="flex justify-between gap-3 border-b border-bg-border/60 py-1">
                          <span className="text-gray-300">
                            {qty(l.amount)} {l.symbol}
                          </span>
                          <span className="tabular-nums">{l.valueUsd === null ? '—' : money(l.valueUsd, 'USD')}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {data.pendingRewards.length > 0 && (
                  <div className="panel flex flex-col gap-2">
                    <p className="stat-label">Waiting to be harvested</p>
                    {data.pendingRewards.map((r) => (
                      <div key={r.symbol + (r.detail ?? '')}>
                        <p className="text-xl font-semibold">
                          {qty(r.amount)} {r.symbol}{' '}
                          <span className="text-sm font-normal text-gray-400">{r.valueUsd === null ? '' : money(r.valueUsd, 'USD')}</span>
                        </p>
                        {r.detail && <p className="text-xs text-gray-500">{r.detail}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="panel flex flex-col gap-3">
              <p className="stat-label">History</p>
              {data.historyError ? (
                <p className="text-sm text-yellow-300">History unavailable right now ({data.historyError}) - try again in a minute.</p>
              ) : data.history.length === 0 ? (
                <p className="text-sm text-gray-500">No liquidity transactions found yet.</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-gray-400">Put in (value on the day)</p>
                      <p className="font-semibold">{money(data.totals.addedUsd, 'USD')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Taken out (value on the day)</p>
                      <p className="font-semibold">{money(data.totals.removedUsd, 'USD')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">CAKE rewards received</p>
                      <p className="font-semibold">{money(data.totals.rewardsUsd, 'USD')}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>What</th>
                          <th>Coins</th>
                          <th>Value then</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.map((ev) => {
                          const value = ev.legs.reduce((s, l) => s + Math.abs(l.valueUsd ?? 0), 0);
                          return (
                            <tr key={ev.hash}>
                              <td className="whitespace-nowrap">
                                <a href={`https://bscscan.com/tx/${ev.hash}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                                  {new Date(ev.timestamp).toLocaleDateString('en-CA')}
                                </a>
                              </td>
                              <td className={ev.type === 'added' ? 'text-gray-100' : ev.type === 'removed' ? 'text-gray-300' : 'text-gain'}>
                                {TYPE_LABELS[ev.type]}
                              </td>
                              <td className="text-sm">
                                {ev.legs.map((l) => `${qty(Math.abs(l.amount))} ${l.symbol}`).join(' + ')}
                                {ev.type !== 'harvest' && ev.rewardsUsd > 0 && (
                                  <span className="block text-xs text-gray-500">+ {money(ev.rewardsUsd, 'USD')} CAKE rewards</span>
                                )}
                              </td>
                              <td>{money(ev.type === 'harvest' ? ev.rewardsUsd : value, 'USD')}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </StateView>
    </div>
  );
}
