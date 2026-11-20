'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Area, AreaChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import FreshNote from '@/components/FreshNote';
import { useStoredThenLive } from '@/hooks/useStoredThenLive';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { BucketSnapshot, CombinedPortfolio, LpSnapshot, SovSnapshot } from '@/lib/types';
import type { StrategyMarket } from '@/app/api/strategy/market/route';
import { PARTS, PART_COLOR, PART_LABEL, changes, cleanRows, peak, toCsv, totalOf, weights, type Part, type SummaryRow } from '@/lib/summary';

type Unit = 'usd' | 'cad' | 'btc';
type Range = 'all' | '5y' | '2y' | '1y';
const LS = 'mes-summary:v1';
const LS_VIEW = 'mes-summary:view';
const TARGET: Record<Part, number> = { sov: 0.55, tokens: 0.15, lp: 0.15, cash: 0.15, ai: 0 };

const usd0 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pct = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;
const btcF = (v: number) => `₿${v.toFixed(v < 1 ? 4 : 3)}`;
const today = () => new Date().toISOString().slice(0, 10);
const btnCls = 'rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent disabled:opacity-40';
const btnPrimary = 'rounded-md border border-accent bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/25 disabled:opacity-40';
const segCls = (on: boolean) => `px-2.5 py-1 text-sm ${on ? 'bg-accent/20 font-semibold text-accent' : 'text-gray-300 hover:text-accent'}`;
const tipStyle = {
  contentStyle: { background: 'rgb(var(--c-panel))', border: '1px solid rgb(var(--c-border))', borderRadius: 8, color: 'rgb(var(--g-100))' },
  itemStyle: { color: 'rgb(var(--g-100))' },
  labelStyle: { color: 'rgb(var(--g-300))' },
};

function readLS<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function writeLS(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
}

function inUnit(usd: number, r: Pick<SummaryRow, 'cad' | 'btc'>, u: Unit): number | null {
  if (u === 'usd') return usd;
  if (u === 'cad') return r.cad ? usd * r.cad : null;
  return r.btc ? usd / r.btc : null;
}
function fmtUnit(v: number | null, u: Unit): string {
  if (v == null) return '–';
  if (u === 'btc') return btcF(v);
  return u === 'cad' ? `${v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 })} CAD` : usd0(v);
}
const short = (v: number, u: Unit) => (u === 'btc' ? v.toFixed(2) : v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-bg-border">
      {options.map(([v, l]) => (
        <button key={v} type="button" className={segCls(v === value)} aria-pressed={v === value} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export default function SummaryPage() {
  const store = useSWR(`${BASE_PATH}/api/summary`, (u: string) => fetchApiResult<{ rows: SummaryRow[] } | null>(u), { revalidateOnFocus: false });
  const cash = useStoredThenLive<BucketSnapshot>('/api/cash');
  const tokens = useStoredThenLive<BucketSnapshot>('/api/tokens');
  const sov = useStoredThenLive<SovSnapshot>('/api/sov');
  const lp = useStoredThenLive<LpSnapshot>('/api/lp');
  const pf = useStoredThenLive<CombinedPortfolio>('/api/portfolio');
  const market = useSWR(`${BASE_PATH}/api/strategy/market`, (u: string) => fetchApiResult<StrategyMarket>(u), { revalidateOnFocus: false });

  const [localRows, setLocalRows] = useState<SummaryRow[] | null>(null);
  const [view, setView] = useState<{ unit: Unit; range: Range }>({ unit: 'usd', range: 'all' });
  // browser-only state after the first render (no hydration mismatch)
  useEffect(() => {
    setLocalRows(cleanRows(readLS(LS)));
    const v = readLS<Partial<{ unit: Unit; range: Range }>>(LS_VIEW);
    if (v) setView((o) => ({ ...o, ...v }));
  }, []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const serverOk = store.data != null; // null = no database (local preview)
  const rows: SummaryRow[] = useMemo(() => (serverOk ? store.data!.rows : (localRows ?? [])), [serverOk, store.data, localRows]);
  const setV = (p: Partial<typeof view>) => setView((v) => { const n = { ...v, ...p }; writeLS(LS_VIEW, n); return n; });

  // today's numbers, from the same section pages as /portfolio
  const live: SummaryRow | null = useMemo(() => {
    if (!cash.data || !tokens.data || !sov.data || !lp.data) return null;
    const w = (k: string) => pf.data?.wallets.find((x) => x.key === k)?.totalValueUsd ?? 0;
    const btcA = sov.data.assets.find((a) => a.asset === 'BTC');
    const btc = btcA && btcA.amount ? btcA.valueUsd / btcA.amount : null;
    const last = rows[rows.length - 1];
    return {
      d: today(),
      n: last ? (last.d === today() ? last.n : last.n + 1) : 1,
      tokens: Math.round(tokens.data.totalUsd * 100) / 100,
      cash: Math.round(cash.data.totalUsd * 100) / 100,
      lp: Math.round(lp.data.totalUsd * 100) / 100,
      ai: Math.round(w('ai') * 100) / 100,
      mfa: Math.round(w('mfa') * 100) / 100,
      sov: Math.round(sov.data.totalUsd * 100) / 100,
      cad: sov.data.cadRate ?? cash.data.cadRate ?? null,
      btc: btc ? Math.round(btc) : null,
      dom: null,
      fng: market.data?.inputs.fng ?? null,
    };
  }, [cash.data, tokens.data, sov.data, lp.data, pf.data, market.data, rows]);

  const ch = useMemo(() => changes(rows), [rows]);
  const last = rows[rows.length - 1] ?? null;
  const top = useMemo(() => peak(rows), [rows]);
  const liveTotal = live ? totalOf(live) : null;
  const savedToday = last?.d === today();

  const shown = useMemo(() => {
    const yrs = { all: 99, '5y': 5, '2y': 2, '1y': 1 }[view.range];
    const from = new Date(Date.now() - yrs * 365.25 * 86400000).toISOString().slice(0, 10);
    const list = rows.filter((r) => r.d >= from);
    if (live && !savedToday) list.push(live);
    return list.map((r) => {
      const o: Record<string, number | string | null> = { d: r.d };
      for (const p of PARTS) o[p] = inUnit(r[p], r, view.unit);
      o.total = inUnit(totalOf(r), r, view.unit);
      return o;
    });
  }, [rows, live, savedToday, view]);

  async function save(next: SummaryRow[], body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      if (serverOk) {
        const res = await fetch(`${BASE_PATH}/api/summary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || res.statusText);
        await store.mutate({ rows: j.data.rows }, { revalidate: false });
      } else {
        writeLS(LS, next);
        setLocalRows(next);
      }
      setMsg(done);
    } catch (e) {
      setMsg(`Couldn't save: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  const addToday = () => live && save(cleanRows([...rows, live]), { add: live }, savedToday ? "Today's row updated." : `Check #${live.n} saved.`);
  const remove = (d: string) => {
    if (!window.confirm(`Delete the row of ${d}?`)) return;
    save(rows.filter((r) => r.d !== d), { remove: d }, `Deleted ${d}.`);
  };
  const importFile = async (f: File) => {
    try {
      const text = await f.text();
      const j = JSON.parse(text);
      const list = cleanRows(Array.isArray(j) ? j : j.rows);
      if (!list.length) throw new Error('no rows in that file');
      if (rows.length && !window.confirm(`Replace the ${rows.length} rows here with the ${list.length} in the file?`)) return;
      save(list, { rows: list }, `Imported ${list.length} rows.`);
    } catch (e) {
      setMsg(`Couldn't read that file: ${e instanceof Error ? e.message : e}`);
    }
  };
  const download = (name: string, text: string, type: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const u = view.unit;
  const loading = store.isLoading;
  const wNow = live ? weights(live) : last ? weights(last) : null;
  const sinceLast = live && last && !savedToday ? { diff: liveTotal! - totalOf(last), frac: (liveTotal! - totalOf(last)) / (totalOf(last) || 1) } : null;
  const table = [...ch].reverse();
  const tableShown = showAll ? table : table.slice(0, 16);
  const stale = [cash, tokens, sov, lp].find((x) => x.stale);
  const liveErr = !live ? [cash, tokens, sov, lp].find((x) => x.error && !x.isLoading)?.error ?? null : null;

  return (
    <div className="flex flex-col gap-6">
      {/* tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel flex flex-col gap-1">
          <p className="stat-label">Now</p>
          <p className="text-3xl font-semibold tabular-nums text-gray-100">{liveTotal != null && live ? fmtUnit(inUnit(liveTotal, live, u), u) : '…'}</p>
          {live && <p className="text-xs text-gray-400">{u !== 'usd' && liveTotal != null ? usd0(liveTotal) + ' · ' : ''}{live.mfa ? `MikeFA ${usd0(live.mfa)} not counted` : ''}</p>}
          {stale && <FreshNote savedAt={stale.savedAt} updating={stale.updating} error={stale.error} />}
        </div>
        <div className="panel flex flex-col gap-1">
          <p className="stat-label">Since the last check</p>
          {sinceLast ? (
            <>
              <p className={`text-3xl font-semibold tabular-nums ${sinceLast.diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pct(sinceLast.frac)}</p>
              <p className="text-xs text-gray-400">{sinceLast.diff >= 0 ? '+' : '−'}{usd0(Math.abs(sinceLast.diff))} since {last!.d} (#{last!.n})</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">{savedToday ? `Today's row is saved (#${last!.n}).` : liveErr ? `Couldn't load today's numbers (${liveErr}).` : 'Loading…'}</p>
          )}
        </div>
        <div className="panel flex flex-col gap-1">
          <p className="stat-label">Below the highest check</p>
          {top && liveTotal != null ? (
            <>
              <p className="text-3xl font-semibold tabular-nums text-gray-100">{pct(liveTotal / top.total - 1, 0)}</p>
              <p className="text-xs text-gray-400">Highest: {usd0(top.total)} on {top.d}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">…</p>
          )}
        </div>
        <div className="panel flex flex-col gap-1">
          <p className="stat-label">Market</p>
          <p className="text-3xl font-semibold tabular-nums text-gray-100">{live?.btc ? usd0(live.btc) : '…'}</p>
          <p className="text-xs text-gray-400">
            Bitcoin price{live?.fng != null ? ` · Fear & Greed ${Math.round(live.fng)} (${live.fng < 25 ? 'extreme fear' : live.fng < 45 ? 'fear' : live.fng <= 55 ? 'neutral' : live.fng <= 75 ? 'greed' : 'extreme greed'})` : ''}
          </p>
        </div>
      </div>

      {/* save + routine */}
      <div className="panel flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnPrimary} disabled={!live || busy} onClick={addToday}>
            {savedToday ? "Update today's row" : `Save today as check #${live?.n ?? '…'}`}
          </button>
          <button type="button" className={btnCls} disabled={!rows.length} onClick={() => download(`mes-summary-${today()}.csv`, toCsv(rows), 'text/csv')}>
            Download CSV
          </button>
          <button type="button" className={btnCls} disabled={!rows.length} onClick={() => download(`mes-summary-${today()}.json`, JSON.stringify(rows, null, 1), 'application/json')}>
            Backup (JSON)
          </button>
          <label className={`${btnCls} cursor-pointer`}>
            Restore…
            <input type="file" accept=".json,application/json" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
          </label>
          {msg && <span className="text-sm text-gray-300" role="status">{msg}</span>}
        </div>
        <p className="text-sm text-gray-400">
          Routine: look every Friday morning (this page or <a className="text-accent hover:underline" href="https://mes.fm/portfolio">/portfolio</a>); on the first Friday of the month save a row here and review the moves on{' '}
          <a className="text-accent hover:underline" href="https://mes.fm/strategy">/strategy</a>; every 3 months, a full review.
          {!serverOk && !loading ? ' (No database here: rows are kept in this browser only.)' : ''}
        </p>
      </div>

      {/* chart */}
      <div className="panel flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-100">The portfolio over time</h2>
          <div className="flex flex-wrap gap-2">
            <Seg label="Currency" value={u} options={[['usd', 'USD'], ['cad', 'CAD'], ['btc', 'BTC']]} onChange={(v) => setV({ unit: v })} />
            <Seg label="Range" value={view.range} options={[['1y', '1 year'], ['2y', '2 years'], ['5y', '5 years'], ['all', 'All']]} onChange={(v) => setV({ range: v })} />
          </div>
        </div>
        <div className="h-80 w-full">
          {shown.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={shown} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="rgb(var(--c-border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: 'rgb(var(--g-400))', fontSize: 12 }} minTickGap={40} />
                <YAxis tick={{ fill: 'rgb(var(--g-400))', fontSize: 12 }} width={48} tickFormatter={(v: number) => short(v, u)} />
                <Tooltip {...tipStyle} formatter={(v: number, name: string) => [fmtUnit(v, u), name]} />
                {PARTS.map((p) => (
                  <Area key={p} type="monotone" dataKey={p} name={PART_LABEL[p]} stackId="1" stroke={PART_COLOR[p]} fill={PART_COLOR[p]} fillOpacity={0.55} isAnimationActive={false} />
                ))}
                <Line type="monotone" dataKey="total" name="Total" stroke="rgb(var(--g-100))" dot={false} strokeWidth={1.5} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-400">{loading ? 'Loading…' : 'No rows yet.'}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-gray-300">
          {PARTS.map((p) => (
            <span key={p} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: PART_COLOR[p] }} /> {PART_LABEL[p]}
            </span>
          ))}
          {live && !savedToday && <span className="text-gray-400">The last point is today (not saved yet).</span>}
        </div>
      </div>

      {/* mix now vs targets */}
      {wNow && (
        <div className="panel flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-gray-100">Mix now vs the strategy targets</h2>
          <div className="flex flex-col gap-2">
            {PARTS.filter((p) => p !== 'ai' || wNow.ai > 0.001).map((p) => {
              const off = wNow[p] - TARGET[p];
              const band = p === 'ai' ? false : Math.abs(off) > Math.max(0.05, TARGET[p] / 4);
              return (
                <div key={p} className="grid grid-cols-[8.5rem_1fr_7.5rem] items-center gap-2 text-sm">
                  <span className="text-gray-300">{PART_LABEL[p]}</span>
                  <div className="relative h-3 rounded bg-bg-border/60">
                    <div className="absolute left-0 top-0 h-3 rounded" style={{ width: `${Math.min(100, wNow[p] * 100)}%`, background: PART_COLOR[p] }} />
                    {TARGET[p] > 0 && <div className="absolute top-[-3px] h-[18px] w-0.5 bg-gray-100" style={{ left: `${TARGET[p] * 100}%` }} title={`Target ${Math.round(TARGET[p] * 100)}%`} />}
                  </div>
                  <span className={`tabular-nums ${band ? 'font-semibold text-yellow-300' : 'text-gray-200'}`}>
                    {Math.round(wNow[p] * 100)}%{TARGET[p] > 0 ? ` / ${Math.round(TARGET[p] * 100)}%` : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">White mark = target from /strategy (15 / 15 / 15 / 55). Yellow = outside the band (more than 5 points, or a quarter of the target, away): a rebalance is worth a look on the next first-Friday review.</p>
        </div>
      )}

      {/* table */}
      <div className="panel flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-gray-100">Every check ({rows.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[54rem] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-bg-border text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="py-1.5 pr-2">Date</th>
                <th className="pr-2">#</th>
                {PARTS.map((p) => <th key={p} className="pr-2 text-right">{PART_LABEL[p]}</th>)}
                <th className="pr-2 text-right">Total</th>
                <th className="pr-2 text-right">Change</th>
                <th className="pr-2 text-right">{u === 'usd' ? 'CAD' : u === 'cad' ? 'USD' : 'USD'}</th>
                <th className="pr-2 text-right">In BTC</th>
                <th className="pr-2 text-right">BTC price</th>
                <th className="pr-2 text-right">F&amp;G</th>
                <th className="sr-only">Delete</th>
              </tr>
            </thead>
            <tbody>
              {live && !savedToday && (
                <tr className="border-b border-bg-border/60 bg-accent/5 italic text-gray-300">
                  <td className="py-1 pr-2">Today</td>
                  <td className="pr-2">({live.n})</td>
                  {PARTS.map((p) => <td key={p} className="pr-2 text-right">{fmtUnit(inUnit(live[p], live, u), u)}</td>)}
                  <td className="pr-2 text-right font-semibold">{fmtUnit(inUnit(liveTotal!, live, u), u)}</td>
                  <td className={`pr-2 text-right ${sinceLast && sinceLast.diff < 0 ? 'text-red-400' : 'text-green-400'}`}>{sinceLast ? pct(sinceLast.frac) : ''}</td>
                  <td className="pr-2 text-right">{u === 'usd' ? fmtUnit(inUnit(liveTotal!, live, 'cad'), 'cad') : usd0(liveTotal!)}</td>
                  <td className="pr-2 text-right">{fmtUnit(inUnit(liveTotal!, live, 'btc'), 'btc')}</td>
                  <td className="pr-2 text-right">{live.btc ? usd0(live.btc) : '–'}</td>
                  <td className="pr-2 text-right">{live.fng ?? '–'}</td>
                  <td />
                </tr>
              )}
              {tableShown.map(({ row: r, total, frac }) => (
                <tr key={r.d} className="border-b border-bg-border/60 text-gray-200">
                  <td className="py-1 pr-2">{r.d}</td>
                  <td className="pr-2 text-gray-400">{r.n}</td>
                  {PARTS.map((p) => <td key={p} className="pr-2 text-right">{r[p] ? fmtUnit(inUnit(r[p], r, u), u) : '–'}</td>)}
                  <td className="pr-2 text-right font-semibold">{fmtUnit(inUnit(total, r, u), u)}</td>
                  <td className={`pr-2 text-right ${frac == null ? '' : frac < 0 ? 'text-red-400' : 'text-green-400'}`}>{frac == null ? '' : pct(frac)}</td>
                  <td className="pr-2 text-right text-gray-400">{u === 'usd' ? fmtUnit(inUnit(total, r, 'cad'), 'cad') : usd0(total)}</td>
                  <td className="pr-2 text-right text-gray-400">{fmtUnit(inUnit(total, r, 'btc'), 'btc')}</td>
                  <td className="pr-2 text-right text-gray-400">{r.btc ? usd0(r.btc) : '–'}</td>
                  <td className="pr-2 text-right text-gray-400">{r.fng ?? '–'}</td>
                  <td>
                    <button type="button" className="px-1 text-gray-500 hover:text-red-400" aria-label={`Delete ${r.d}`} title="Delete this row" onClick={() => remove(r.d)} disabled={busy}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {table.length > 16 && (
          <button type="button" className={`${btnCls} self-start`} onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Show the newest 16' : `Show all ${table.length}`}
          </button>
        )}
        <p className="text-xs text-gray-400">Total = Store of Value + Tokens + Liquidity + Cash LP + AI Trading (MikeFA is not counted, as in the old spreadsheet). Rows before 2026 came from the Summary tab of MES Cryptos.xlsx.</p>
      </div>
    </div>
  );
}
