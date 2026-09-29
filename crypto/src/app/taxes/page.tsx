'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import CsvExportButton from '@/components/CsvExportButton';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import TaxesTable from '@/components/TaxesTable';
import TaxSummary, { money } from '@/components/TaxSummary';
import { useTaxes } from '@/hooks/useTaxes';
import { BASE_PATH } from '@/lib/basePath';
import { WALLET_KEYS, WALLET_LABELS, type WalletKey } from '@/lib/wallets';

function initialWallet(param: string | null): WalletKey | undefined {
  return WALLET_KEYS.includes(param as WalletKey) ? (param as WalletKey) : undefined;
}

const chip = (on: boolean) => `rounded px-2.5 py-1 text-sm ${on ? 'bg-accent text-bg' : 'text-gray-300 hover:text-accent'}`;

function TaxesPageInner() {
  const searchParams = useSearchParams();
  const [year, setYear] = useState<number | undefined>(() => {
    const y = Number(searchParams.get('year'));
    return Number.isInteger(y) && y > 2000 ? y : undefined;
  });
  const [wallet, setWallet] = useState<WalletKey | undefined>(() => initialWallet(searchParams.get('wallet')));
  const [currency, setCurrency] = useState<'CAD' | 'USD'>('CAD');
  const { taxes, isLoading, error, rateLimited, refresh } = useTaxes(year, wallet);

  async function saveLabel(id: string, record: { tag: string; notes: string; screenshotUrls: string[] }) {
    await fetch(`${BASE_PATH}/api/taxes/labels`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...record }),
    });
    refresh();
  }

  const failed = taxes?.sources.filter((s) => s.error) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-sm text-gray-400">
        <p>
          Your capital gains and losses for Canadian taxes, across <strong className="text-gray-200">every wallet at once</strong> (Main,
          AI Trading, MikeFA Trading and Store of Value are just groupings - they&apos;re all yours, so they&apos;re all counted together).
        </p>
        <p>
          A row appears whenever you <strong className="text-gray-200">got rid of</strong> a coin: sold it, swapped it for another, or added it to a
          liquidity pool. Its <em>gain</em> is what it was worth that day minus what it cost you. What it cost is your{' '}
          <strong className="text-gray-200">adjusted cost base (ACB)</strong>: the average price you paid for all of that coin you hold, in every
          wallet - the only method the CRA allows for crypto. Moving coins between your own wallets isn&apos;t a sale and is left out. Everything
          is in Canadian dollars at the Bank of Canada rate of each day.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={year ?? taxes?.year ?? ''}
            onChange={(e) => setYear(Number(e.target.value) || undefined)}
            aria-label="Tax year"
            className="rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-sm text-gray-100"
          >
            {(taxes?.years.length ? taxes.years : [taxes?.year ?? new Date().getFullYear()]).map((y) => (
              <option key={y} value={y}>
                Tax year {y}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap gap-1 rounded-md border border-bg-border p-0.5">
            <button type="button" onClick={() => setWallet(undefined)} className={chip(!wallet)}>
              All wallets
            </button>
            {WALLET_KEYS.map((k) => (
              <button key={k} type="button" onClick={() => setWallet(k)} className={chip(wallet === k)}>
                {WALLET_LABELS[k]}
              </button>
            ))}
          </div>

          <div className="flex gap-1 rounded-md border border-bg-border p-0.5">
            {(['CAD', 'USD'] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)} className={chip(currency === c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <CsvExportButton year={taxes?.year ?? year} wallet={wallet} />
          <RefreshButton onRefreshed={refresh} disabledReason={rateLimited ? (error ?? 'Usage limit reached') : undefined} />
        </div>
      </div>

      <StateView loading={isLoading && !taxes} error={rateLimited && taxes ? null : error} onRetry={refresh}>
        {taxes && (
          <div className="flex flex-col gap-6">
            {(failed.length > 0 || !taxes.cadComplete || taxes.summary.uncoveredCount > 0) && (
              <div className="panel flex flex-col gap-2 border-yellow-500/40 text-sm">
                {failed.map((s) => (
                  <p key={s.key} className="text-yellow-300">
                    <strong>{s.label}</strong> couldn&apos;t be loaded ({s.error}), so its transactions are missing from everything below - the
                    totals will change once it&apos;s back.
                  </p>
                ))}
                {taxes.summary.uncoveredCount > 0 && (
                  <p className="text-yellow-300">
                    {taxes.summary.uncoveredCount} row{taxes.summary.uncoveredCount === 1 ? '' : 's'} sold coins that the tracked history never shows
                    arriving (bought before tracking started, or on an exchange). Their cost is counted as $0, which overstates the gain - note the
                    real cost on those rows.
                  </p>
                )}
                {!taxes.cadComplete && (
                  <p className="text-yellow-300">Some Bank of Canada rates couldn&apos;t be loaded; those CAD amounts use the nearest earlier rate.</p>
                )}
              </div>
            )}

            <TaxSummary summary={taxes.summary} currency={currency} />
            {wallet && (
              <p className="-mt-2 text-xs text-gray-500">
                Totals are for all wallets; the list below shows only {WALLET_LABELS[wallet]}&apos;s rows.
              </p>
            )}

            {taxes.rows.length === 0 ? (
              <div className="panel py-12 text-center text-gray-400">Nothing sold or swapped in {taxes.year}.</div>
            ) : (
              <TaxesTable rows={taxes.rows} currency={currency} onSaveLabel={saveLabel} />
            )}

            <details className="panel">
              <summary className="cursor-pointer text-sm font-medium text-gray-200">
                What you still hold, and its ACB (carried into future years)
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Units</th>
                      <th>ACB (CAD)</th>
                      <th>ACB per unit (CAD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taxes.holdings.map((h) => (
                      <tr key={h.asset}>
                        <td className="font-medium text-gray-100">{h.asset}</td>
                        <td>{h.quantity.toLocaleString('en-US', { maximumFractionDigits: 8 })}</td>
                        <td>{h.acbCad === null ? '—' : money(h.acbCad, 'CAD')}</td>
                        <td>{h.acbCad === null || h.quantity === 0 ? '—' : money(h.acbCad / h.quantity, 'CAD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details className="panel text-sm text-gray-400">
              <summary className="cursor-pointer font-medium text-gray-200">How this is worked out, and what it doesn&apos;t cover yet</summary>
              <ul className="mt-3 list-disc space-y-1.5 pl-5">
                <li>
                  Wallets included:{' '}
                  {taxes.sources.map((s, i) => (
                    <span key={s.key}>
                      {i > 0 && ', '}
                      {s.label} ({s.error ? 'not loaded' : `${s.entries} transfers`})
                    </span>
                  ))}
                  . {taxes.stats.ownTransfers} transfers between your own wallets were left out, and {taxes.stats.unpriced} with no market price
                  (mostly spam airdrops) were ignored.
                </li>
                <li>BTCB, WBTC and other wrapped Bitcoin count as Bitcoin; WETH and bridged ETH as ETH; WBNB as BNB.</li>
                <li>
                  Adding coins to a liquidity pool counts as disposing of them, and taking them out as acquiring them again at that day&apos;s
                  price. Swaps are a sale of one coin and a purchase of the other.
                </li>
                <li>
                  Sending coins to your own exchange account (Shakepay etc.) looks like a sale here, since the deposit address isn&apos;t known to
                  be yours: label those rows <strong className="text-gray-200">Personal transfer</strong> and they stop counting.
                </li>
                <li>
                  Not yet included: your Hive accounts (HIVE/HBD and Hive Engine tokens other than TGLD), the Bitcoin address, Hyperliquid
                  perpetuals, and staking/farming rewards as income (they&apos;re counted at their value when received, as their cost). Gas fees
                  aren&apos;t added to costs, and the superficial-loss rule isn&apos;t applied.
                </li>
                <li>
                  Only half of a net capital gain is taxable (the inclusion rate). This page is a record-keeping aid, not tax advice - have an
                  accountant check the numbers before you file.
                </li>
              </ul>
            </details>
          </div>
        )}
      </StateView>
    </div>
  );
}

export default function TaxesPage() {
  return (
    <Suspense fallback={null}>
      <TaxesPageInner />
    </Suspense>
  );
}
