'use client';

import useSWR from 'swr';
import StateView from '@/components/StateView';
import { money } from '@/components/TaxSummary';
import { useTaxes } from '@/hooks/useTaxes';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { SovSnapshot } from '@/lib/types';

const NAMES: Record<string, string> = { BTC: 'Bitcoin', XRP: 'XRP', TGLD: 'TGLD' };
const CHAINS: Record<string, string> = { bsc: 'BNB Chain', ethereum: 'Ethereum', polygon: 'Polygon', arbitrum: 'Arbitrum', 'hive-engine': 'Hive Engine' };
const qty = (n: number, d = 8) => n.toLocaleString('en-US', { maximumFractionDigits: d });

/**
 * mes.fm/sov - the long-term Store of Value holdings (Bitcoin in every form, XRP, TGLD). Balances
 * come from mes.fm/assets via /api/sov; the cost side (ACB, pooled across every wallet the CRA's way)
 * from the same calculation as mes.fm/taxes. Used to be a separate app/Vercel project.
 */
export default function StoreOfValuePage() {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/sov`, (url: string) => fetchApiResult<SovSnapshot>(url));
  const { taxes, isLoading: acbLoading } = useTaxes();
  const acb = new Map((taxes?.holdings ?? []).map((h) => [h.asset, h]));
  const rate = data?.cadRate ?? null;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">
        Your long-term holdings: Bitcoin (native, BTCB, WBTC and Hive Engine&apos;s SWAP.BTC, all counted as one), XRP and TGLD, across every
        wallet and account. Balances come from{' '}
        <a href="https://mes.fm/assets" className="text-accent hover:underline">
          mes.fm/assets
        </a>
        ; what they cost you (adjusted cost base, in CAD) from{' '}
        <a href="https://mes.fm/taxes" className="text-accent hover:underline">
          mes.fm/taxes
        </a>
        .
      </p>

      <StateView loading={isLoading} error={error instanceof Error ? error.message : null} onRetry={() => mutate()}>
        {data && (
          <div className="flex flex-col gap-6">
            <div className="panel">
              <p className="stat-label">Store of Value total</p>
              <p className="mt-1 text-3xl font-semibold">{money(data.totalUsd, 'USD')}</p>
              {rate && <p className="mt-1 text-sm text-gray-400">{money(data.totalUsd * rate, 'CAD')} at today&apos;s Bank of Canada rate</p>}
              <p className="mt-2 text-xs text-gray-500">Balances as of {new Date(data.fetchedAt).toLocaleString()}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {data.assets.map((a) => {
                const h = acb.get(a.asset);
                const valueCad = rate ? a.valueUsd * rate : null;
                // ACB covers the units the tracked history knows about; fewer units than held means some count at $0 cost
                const gain = !a.noMarket && valueCad !== null && h?.acbCad != null ? valueCad - h.acbCad : null;
                return (
                  <div key={a.asset} className="panel flex flex-col gap-3">
                    <div>
                      <p className="stat-label">{NAMES[a.asset] ?? a.asset}</p>
                      <p className="mt-1 text-2xl font-semibold">
                        {qty(a.amount, a.asset === 'BTC' ? 8 : 3)} {a.asset}
                      </p>
                      {a.noMarket ? (
                        <p className="text-sm text-yellow-300">
                          No buyers right now
                          {a.noMarket.lowestAskHive !== null && ` (cheapest offer to sell: ${qty(a.noMarket.lowestAskHive, 2)} HIVE each)`} - not counted in
                          the total
                        </p>
                      ) : (
                        <p className="text-sm text-gray-300">
                          {money(a.valueUsd, 'USD')}
                          {valueCad !== null && <span className="text-gray-500"> · {money(valueCad, 'CAD')}</span>}
                        </p>
                      )}
                    </div>

                    <div className="rounded-md border border-bg-border px-3 py-2 text-sm">
                      {acbLoading && !h ? (
                        <p className="text-gray-500">Working out what it cost…</p>
                      ) : h?.acbCad != null ? (
                        <>
                          <p className="flex justify-between">
                            <span className="text-gray-400">Cost (ACB)</span>
                            <span>{money(h.acbCad, 'CAD')}</span>
                          </p>
                          {gain !== null && (
                            <p className="flex justify-between">
                              <span className="text-gray-400">Unrealized {gain >= 0 ? 'gain' : 'loss'}</span>
                              <span className={gain >= 0 ? 'text-gain' : 'text-loss'}>{money(gain, 'CAD')}</span>
                            </p>
                          )}
                          {h.quantity < a.amount * 0.999 && (
                            <p className="mt-1 text-xs text-yellow-300">
                              Cost known for {qty(h.quantity, 6)} of {qty(a.amount, 6)} - the rest (e.g. SWAP.BTC on Hive Engine, not tracked yet)
                              counts at $0.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-gray-500">No cost history found yet.</p>
                      )}
                    </div>

                    <ul className="flex flex-col gap-1 text-sm">
                      {a.lines.map((l, i) => (
                        <li key={`${l.where}-${l.symbol}-${i}`} className="flex justify-between gap-3 border-b border-bg-border/60 py-1">
                          <span className="min-w-0 truncate text-gray-300">
                            {l.label !== l.symbol ? l.label : l.symbol}{' '}
                            <span className="text-gray-500">
                              · {l.where}
                              {CHAINS[l.source] && !l.where.startsWith('Hive') ? ` (${CHAINS[l.source]})` : ''}
                            </span>
                          </span>
                          <span className="whitespace-nowrap tabular-nums">{qty(l.amount, a.asset === 'BTC' ? 8 : 3)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </StateView>
    </div>
  );
}
