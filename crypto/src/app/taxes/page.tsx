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
import { TAX_GROUPS, TAX_GROUP_LABELS, sourceLabel, type TaxGroup } from '@/lib/tax/taxSources';
import type { LabelRecord } from '@/lib/types';

function initialGroup(param: string | null): TaxGroup | undefined {
  return TAX_GROUPS.includes(param as TaxGroup) ? (param as TaxGroup) : undefined;
}

const chip = (on: boolean) => `rounded px-2.5 py-1 text-sm ${on ? 'bg-accent text-bg' : 'text-gray-300 hover:text-accent'}`;

function TaxesPageInner() {
  const searchParams = useSearchParams();
  const [year, setYear] = useState<number | undefined>(() => {
    const y = Number(searchParams.get('year'));
    return Number.isInteger(y) && y > 2000 ? y : undefined;
  });
  const [wallet, setWallet] = useState<TaxGroup | undefined>(() => initialGroup(searchParams.get('wallet')));
  const [currency, setCurrency] = useState<'CAD' | 'USD'>('CAD');
  const { taxes, isLoading, error, rateLimited, refresh } = useTaxes(year, wallet);

  async function saveLabel(id: string, record: Omit<LabelRecord, 'updatedAt'>) {
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
          Your capital gains, losses and crypto income for Canadian taxes, across <strong className="text-gray-200">every wallet and account at
          once</strong>: the Main, AI Trading and MikeFA Trading wallets, your Bitcoin and XRP addresses, and your Hive accounts (@mes,
          @mestruth, @mathiew, @artgrafiken, TGLD included). The groupings are just for you - it&apos;s all yours, so it&apos;s all counted together.
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
            {TAX_GROUPS.map((k) => (
              <button key={k} type="button" onClick={() => setWallet(k)} className={chip(wallet === k)}>
                {TAX_GROUP_LABELS[k]}
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
            {(taxes.needsInput.sends > 0 || taxes.needsInput.unknownCost > 0) && (
              <div className="panel flex flex-col gap-2 border-yellow-500/40 text-sm text-gray-300">
                <p className="font-semibold text-yellow-300">Needs your input ({taxes.year})</p>
                {taxes.needsInput.unknownCost > 0 && (
                  <p>
                    <strong className="text-gray-100">{taxes.needsInput.unknownCost}</strong> row{taxes.needsInput.unknownCost === 1 ? '' : 's'} marked{' '}
                    <span className="text-yellow-300">cost unknown</span>: coins sold that the history never shows arriving (bought on an exchange,
                    before a wallet was tracked, or held when Hive launched in March 2020). They count at a cost of $0 for now, which makes the gain
                    look bigger than it was. If you know what they cost, click <em>Label</em> on the row and enter it.
                  </p>
                )}
                {taxes.needsInput.sends > 0 && (
                  <p>
                    <strong className="text-gray-100">{taxes.needsInput.sends}</strong> row{taxes.needsInput.sends === 1 ? '' : 's'} marked{' '}
                    <span className="text-yellow-300">needs a label</span>: coins sent out with nothing coming back (a payment, a gift, or a deposit to
                    an exchange). They count as sales at that day&apos;s price. If one went to your own exchange account, label it{' '}
                    <strong className="text-gray-100">Personal transfer</strong> and it stops counting; otherwise any label (Payment, Gift, Trade)
                    clears the flag.
                  </p>
                )}
                <p className="text-xs text-gray-500">Highlighted rows below. Everything you enter is saved with the row and goes into the CSV.</p>
              </div>
            )}

            {(failed.length > 0 || !taxes.cadComplete) && (
              <div className="panel flex flex-col gap-2 border-yellow-500/40 text-sm">
                {failed.map((s) => (
                  <p key={s.key} className="text-yellow-300">
                    <strong>{s.label}</strong> couldn&apos;t be loaded ({s.error}), so its transactions are missing from everything below - the
                    totals will change once it&apos;s back.
                  </p>
                ))}
                {!taxes.cadComplete && (
                  <p className="text-yellow-300">Some Bank of Canada rates couldn&apos;t be loaded; those CAD amounts use the nearest earlier rate.</p>
                )}
              </div>
            )}

            <TaxSummary summary={taxes.summary} currency={currency} />
            {wallet && (
              <p className="-mt-2 text-xs text-gray-500">
                Totals are for all wallets; the list below shows only {TAX_GROUP_LABELS[wallet]}&apos;s rows.
              </p>
            )}

            {taxes.rows.length === 0 ? (
              <div className="panel py-12 text-center text-gray-400">Nothing sold or swapped in {taxes.year}.</div>
            ) : (
              <TaxesTable rows={taxes.rows} currency={currency} onSaveLabel={saveLabel} />
            )}

            <div className="panel flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="stat-label">Crypto income, {taxes.year}</p>
                <p className="text-xl font-semibold">{money(currency === 'CAD' ? taxes.income.totalCad : taxes.income.totalUsd, currency)}</p>
              </div>
              {taxes.income.byKind.length === 0 ? (
                <p className="text-sm text-gray-500">No rewards or interest recorded for {taxes.year}.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Kind</th>
                        <th>Paid in</th>
                        <th>Times</th>
                        <th>Amount</th>
                        <th>Value (CAD, on the day received)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxes.income.byKind.map((k) => (
                        <tr key={`${k.kind}-${k.asset}`}>
                          <td className="text-gray-100">{k.kind}</td>
                          <td>{k.asset}</td>
                          <td>{k.count}</td>
                          <td>{k.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}</td>
                          <td>{money(k.cad, 'CAD')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-gray-500">
                Hive author/curation rewards count when you claimed them; the Hive Power part is converted to HIVE at the chain&apos;s own rate
                that day. HBD savings interest counts when paid. Each is valued in CAD on the day received, and that value is also its cost (ACB)
                when you later sell. Income is reported separately from capital gains - ask your accountant whether it&apos;s business or
                property income for you.
              </p>
            </div>

            {taxes.receipts.bySender.length > 0 && (
              <details className="panel">
                <summary className="cursor-pointer text-sm font-medium text-gray-200">
                  Received from other accounts in {taxes.year}: {money(taxes.receipts.totalCad, 'CAD')} - may be income, needs your judgment
                </summary>
                <p className="mt-2 text-xs text-gray-500">
                  Coins that arrived from someone else with nothing sent back: delegation payouts (reward.app, actifit.pay, hivestudents …),
                  tips, airdrops, or withdrawals from your own exchange account. They&apos;re counted at their value on arrival (which becomes their
                  cost) but are <strong>not</strong> added to the income above, since only you know which were earnings. Payouts for delegating
                  or curating are usually income; withdrawals from your own exchange account are not.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>From</th>
                        <th>To</th>
                        <th>Coin</th>
                        <th>Times</th>
                        <th>Value (CAD)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxes.receipts.bySender.slice(0, 60).map((r) => (
                        <tr key={`${r.counterparty}-${r.source}-${r.asset}`}>
                          <td className="text-gray-100">{r.counterparty}</td>
                          <td>{sourceLabel(r.source)}</td>
                          <td>{r.asset}</td>
                          <td>{r.count}</td>
                          <td>{money(r.cad, 'CAD')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
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
                  . {taxes.stats.ownTransfers} transfers between your own wallets and accounts were left out, and {taxes.stats.unpriced} with no
                  market price (mostly spam airdrops) were ignored. Prices: DefiLlama daily (checked against Binance), CoinGecko as a backup.
                </li>
                <li>BTCB, WBTC and other wrapped Bitcoin count as Bitcoin; WETH and bridged ETH as ETH; WBNB as BNB.</li>
                <li>
                  Adding coins to a liquidity pool counts as disposing of them, and taking them out as acquiring them again at that day&apos;s
                  price. Swaps are a sale of one coin and a purchase of the other.
                </li>
                <li>
                  Sending coins to your own exchange account (Shakepay etc.) looks like a sale here, since the deposit address isn&apos;t known to
                  be yours: label those rows <strong className="text-gray-200">Personal transfer</strong> and they stop counting. Sales you then
                  made <em>on</em> the exchange come from the exchange&apos;s own reports.
                </li>
                <li>
                  Hive: only money moves are read - transfers, internal-market trades, HBD/HIVE conversions, reward claims, HBD savings interest
                  (never votes, posts or comments). Powering up/down and savings are your own HIVE/HBD changing form, so they&apos;re skipped, as are
                  transfers between your four accounts and to/from Hive Engine&apos;s peg (@honey-swap). History starts when Hive launched on
                  2020-03-20; what you held then counts at $0 cost.
                </li>
                <li>
                  XRP: every transaction&apos;s exact effect on your balance, from the XRP Ledger itself (escrows you create and cancel are
                  your own XRP). TGLD: all four Hive accounts; payouts from @tgld.yield count as income.
                </li>
                <li>
                  Not yet included: Hive Engine tokens (LEO, SWAP.BTC …) other than TGLD, Magi, Hyperliquid perpetuals. Gas fees aren&apos;t added
                  to costs, and the superficial-loss rule isn&apos;t applied.
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
