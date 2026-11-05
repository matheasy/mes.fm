'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import CsvExportButton from '@/components/CsvExportButton';
import FiledReports from '@/components/FiledReports';
import SyncStatus from '@/components/SyncStatus';
import StateView from '@/components/StateView';
import TaxesTable from '@/components/TaxesTable';
import TaxSummary, { money } from '@/components/TaxSummary';
import YearNotes from '@/components/YearNotes';
import { useTaxes } from '@/hooks/useTaxes';
import { BASE_PATH } from '@/lib/basePath';
import { sourceLabel } from '@/lib/tax/taxSources';
import { SECTIONS, SECTION_LABELS, type Section } from '@/lib/sections';
import SectionOverview from '@/components/SectionOverview';
import TokenPicker from '@/components/TokenPicker';
import { custodyLabelId, NOT_ROUND_TRIP, yearNotesId, type LabelRecord } from '@/lib/types';
import { knownName } from '@/lib/tax/knownAddresses';

/** ?section=cash, or the older ?wallet=ai / ?wallet=mfa links from the AI Trading and MikeFA pages */
function initialSection(section: string | null, wallet: string | null): Section | undefined {
  if (SECTIONS.includes(section as Section)) return section as Section;
  return wallet === 'ai' || wallet === 'mfa' ? wallet : undefined;
}

const amt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 4 });

function contractUrl(network: string, address: string): string {
  const host = { bsc: 'bscscan.com', ethereum: 'etherscan.io', polygon: 'polygonscan.com', arbitrum: 'arbiscan.io' }[network] ?? 'bscscan.com';
  return `https://${host}/address/${address}`;
}

const chip = (on: boolean) => `rounded px-2.5 py-1 text-sm ${on ? 'bg-accent text-bg' : 'text-gray-300 hover:text-accent'}`;

function TaxesPageInner() {
  const searchParams = useSearchParams();
  const [year, setYear] = useState<number | undefined>(() => {
    const y = Number(searchParams.get('year'));
    return Number.isInteger(y) && y > 2000 ? y : undefined;
  });
  const [section, setSectionState] = useState<Section | undefined>(() => initialSection(searchParams.get('section'), searchParams.get('wallet')));
  const setSection = (next: Section | undefined) => {
    setSectionState(next);
    const url = new URL(window.location.href);
    url.searchParams.delete('wallet');
    if (next) url.searchParams.set('section', next);
    else url.searchParams.delete('section');
    window.history.replaceState(null, '', url.toString());
  };
  const [token, setTokenState] = useState<string | undefined>(() => searchParams.get('token') || undefined);
  const setToken = (next: string | undefined) => {
    setTokenState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('token', next);
    else url.searchParams.delete('token');
    window.history.replaceState(null, '', url.toString());
  };
  const [currency, setCurrency] = useState<'CAD' | 'USD'>('CAD');
  const [onlyNeedsInput, setOnlyNeedsInput] = useState(false);
  const { taxes, isLoading, error, rateLimited, refresh } = useTaxes(year, section);

  /** Switch a detected round-trip contract off / back on (stored like a row label) */
  async function setRoundTrip(network: string, address: string, on: boolean) {
    const id = custodyLabelId(network, address);
    if (on) await fetch(`${BASE_PATH}/api/taxes/labels?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    else
      await fetch(`${BASE_PATH}/api/taxes/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, tag: NOT_ROUND_TRIP, notes: '', screenshotUrls: [] }),
      });
    refresh();
  }

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
          @mestruth, @mathiew, @artgrafiken, TGLD included). The sections (AI Trading, MikeFA, Store of Value, Liquidity, Cash LP, Tokens) are
          just for you - it&apos;s all yours, so it&apos;s all counted together.
        </p>
        <p>
          A row appears whenever you <strong className="text-gray-200">got rid of</strong> a coin: sold it, swapped it for another, or added it to a
          liquidity pool. Its <em>gain</em> is what it was worth that day minus what it cost you. What it cost is your{' '}
          <strong className="text-gray-200">adjusted cost base (ACB)</strong>: the average price you paid for all of that coin you hold, in every
          wallet - the only method the CRA allows for crypto. Moving coins between your own wallets isn&apos;t a sale and is left out. Everything
          is in Canadian dollars at the Bank of Canada rate of each day.
        </p>
      </div>

      <SyncStatus onSynced={refresh} />

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
            <button type="button" onClick={() => setSection(undefined)} className={chip(!section)}>
              All
            </button>
            {SECTIONS.map((k) => (
              <button key={k} type="button" onClick={() => setSection(k)} className={chip(section === k)}>
                {SECTION_LABELS[k]}
              </button>
            ))}
          </div>

          {taxes && <TokenPicker tokens={taxes.tokens ?? []} year={taxes.year} value={token} onChange={setToken} />}

          <div className={`flex gap-1 rounded-md border border-bg-border p-0.5 ${token ? 'ml-5' : ''}`}>
            {(['CAD', 'USD'] as const).map((c) => (
              <button key={c} type="button" onClick={() => setCurrency(c)} className={chip(currency === c)}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <CsvExportButton year={taxes?.year ?? year} section={section} />
        </div>
      </div>

      <StateView loading={isLoading && !taxes} error={rateLimited && taxes ? null : error} onRetry={refresh}>
        {taxes && (
          <div className="flex flex-col gap-6">
            <SectionOverview year={taxes.year} sections={taxes.bySection} selected={section} onSelect={setSection} />
            {(taxes.needsInput.sends > 0 || taxes.needsInput.unknownCost > 0) && (
              <div className="panel flex flex-col gap-2 border-yellow-500/40 text-sm text-gray-300">
                <p className="font-semibold text-yellow-300">Needs your input ({taxes.year})</p>
                {taxes.needsInput.unknownCost > 0 && (
                  <p>
                    <strong className="text-gray-100">{taxes.needsInput.unknownCost}</strong> row{taxes.needsInput.unknownCost === 1 ? '' : 's'} marked{' '}
                    <span className="text-yellow-300">cost unknown</span>: coins sold that the history never shows arriving (bought on an exchange,
                    before a wallet was tracked, or held when Hive launched in March 2020). They count at a cost of $0 for now, which makes the gain
                    look bigger than it was - <strong className="text-gray-100">{money(taxes.summary.zeroCostGainCad, 'CAD')}</strong> of this
                    year&apos;s gain rests on that. Common cause: coins you got through SimpleSwap or an exchange (e.g. HIVE bought with XRP or BTC)
                    that were then sold or swapped here. If you know what they cost, click <em>Label</em> on the row and enter it (in CAD) - the
                    XRP/BTC you sent to SimpleSwap is already counted as a sale on its own row.
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
                <label className="flex items-center gap-2 text-sm text-gray-200">
                  <input type="checkbox" checked={onlyNeedsInput} onChange={(e) => setOnlyNeedsInput(e.target.checked)} />
                  Show only the rows that need my input
                </label>
                <p className="text-xs text-gray-500">Highlighted rows below. Everything you enter is saved with the row and goes into the CSV.</p>
              </div>
            )}

            {(failed.length > 0 || !taxes.cadComplete) && (
              <div className="panel flex flex-col gap-2 border-yellow-500/40 text-sm">
                {failed.map((s) =>
                  s.key.startsWith('check:') ? (
                    <p key={s.key} className="text-yellow-300">
                      <strong>{s.label}</strong>: {s.error}.
                    </p>
                  ) : (
                    <p key={s.key} className="text-yellow-300">
                      <strong>{s.label}</strong> couldn&apos;t be loaded ({s.error}), so its transactions are missing from everything below - the
                      totals will change once it&apos;s back.
                    </p>
                  ),
                )}
                {!taxes.cadComplete && (
                  <p className="text-yellow-300">Some Bank of Canada rates couldn&apos;t be loaded; those CAD amounts use the nearest earlier rate.</p>
                )}
              </div>
            )}

            <TaxSummary summary={taxes.summary} currency={currency} />
            {section && (
              <p className="-mt-2 text-xs text-gray-500">
                The totals above are for everything; the list below shows only {SECTION_LABELS[section]}&apos;s rows.
              </p>
            )}

            <YearNotes year={taxes.year} notes={taxes.yearNotes} onSave={(record) => saveLabel(yearNotesId(taxes.year), record)} />
            <FiledReports year={taxes.year} />

            {token && <TokenDetail token={(taxes.tokens ?? []).find((t) => t.asset === token)} name={token} year={taxes.year} section={section} onAllSections={() => setSection(undefined)} />}

            {(() => {
              const rows = taxes.rows.filter((r) => (!token || r.asset === token) && (!onlyNeedsInput || r.needsInput.length > 0));
              return rows.length === 0 ? (
                <div className="panel py-12 text-center text-gray-400">
                  Nothing {token ? `in ${token} ` : ''}sold or swapped in {taxes.year}
                  {section ? ` in ${SECTION_LABELS[section]}` : ''}.
                </div>
              ) : (
                <TaxesTable rows={rows} currency={currency} onSaveLabel={saveLabel} />
              );
            })()}

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
                  what SimpleSwap or an exchange sent you for coins you sold there (a purchase, not income - the coins you sent are a sale on
                  their own row),
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

            {taxes.custody.length > 0 && (
              <details className="panel">
                <summary className="cursor-pointer text-sm font-medium text-gray-200">
                  Round trips: coins you deposited into {taxes.custody.length} contract{taxes.custody.length === 1 ? '' : 's'} and later got back -
                  not counted as sales
                </summary>
                <p className="mt-2 text-xs text-gray-500">
                  Coins sent to a smart contract (a staking vault, farm, launchpad lock ...) that later came back from that same contract are
                  treated like moves between your own wallets: no sale going in, no purchase coming out, they keep their original cost. Only the
                  amount that actually came back counts - coins that never came back stay sales (label them Personal transfer if they&apos;re still
                  in a vault), and anything that came back above what went in is counted as received. Your accountant may treat vault deposits
                  as taxable swaps (especially if you got a receipt token back). Untick <em>Round trip?</em> for a contract that was really a
                  sale, a bridge or a token migration - e.g. one that sent back far more than went in.
                </p>
                <div className="mt-3 overflow-x-auto">
                  <table>
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Coin</th>
                        <th>Went in and came back</th>
                        <th>Never came back (sold)</th>
                        <th>Came back extra (received)</th>
                        <th>Round trip?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxes.custody.map((c) => (
                        <tr key={`${c.network}-${c.address}-${c.asset}`}>
                          <td className="whitespace-nowrap">
                            <a href={contractUrl(c.network, c.address)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                              {c.address.slice(0, 8)}…{c.address.slice(-6)}
                            </a>
                            <span className="block text-xs capitalize text-gray-500">{c.network}</span>
                            {knownName(c.address) && <span className="block text-xs text-gray-400">{knownName(c.address)}</span>}
                          </td>
                          <td className="font-medium text-gray-100">{c.asset}</td>
                          <td>{amt(c.matched)}</td>
                          <td>{c.notReturned > 1e-9 ? amt(c.notReturned) : '—'}</td>
                          <td>{c.extra > 1e-9 ? amt(c.extra) : '—'}</td>
                          <td>
                            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs">
                              <input type="checkbox" checked={!c.disabled} onChange={(ev) => setRoundTrip(c.network, c.address, ev.target.checked)} />
                              {c.disabled ? 'no - counted as sales' : 'yes'}
                            </label>
                          </td>
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

/** The picked token's year at a glance: its sales (every section), income and what's still held */
function TokenDetail({
  token,
  name,
  year,
  section,
  onAllSections,
}: {
  token?: import('@/lib/types').TaxTokenSummary;
  name: string;
  year: number;
  section?: Section;
  onAllSections: () => void;
}) {
  if (!token) return <div className="panel text-sm text-gray-400">{name}: no sales, income or holdings found for {year}.</div>;
  const cells = [
    { label: `Sales in ${year}`, value: String(token.sales) },
    { label: 'Proceeds', value: money(token.proceedsCad, 'CAD') },
    { label: 'ACB of what was sold', value: money(token.costCad, 'CAD') },
    { label: token.gainCad >= 0 ? 'Capital gain' : 'Capital loss', value: money(token.gainCad, 'CAD'), cls: token.gainCad >= 0 ? 'text-gain' : 'text-loss' },
    { label: 'Income', value: money(token.incomeCad, 'CAD') },
    {
      label: 'Still held (ACB)',
      value: token.held > 0 ? `${token.held.toLocaleString('en-US', { maximumFractionDigits: 8 })} (${token.acbCad === null ? '—' : money(token.acbCad, 'CAD')})` : '0',
    },
  ];
  const other = section ? token.sections.filter((s) => s !== section) : [];
  return (
    <div className="panel flex flex-col gap-3">
      <p className="stat-label">
        {name}, {year} (CAD) · every section · in {token.sections.map((s) => SECTION_LABELS[s]).join(', ') || '—'}
      </p>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label}>
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className={`text-lg font-semibold ${c.cls ?? ''}`}>{c.value}</p>
          </div>
        ))}
      </div>
      {other.length > 0 && (
        <p className="text-xs text-gray-400">
          The list below shows only {SECTION_LABELS[section!]}&apos;s {name} rows; {name} also has rows in {other.map((s) => SECTION_LABELS[s]).join(', ')}.{' '}
          <button type="button" onClick={onAllSections} className="text-accent hover:underline">
            Show every section
          </button>
        </p>
      )}
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
