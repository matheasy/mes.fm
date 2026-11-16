'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import FreshNote from '@/components/FreshNote';
import { useStoredThenLive } from '@/hooks/useStoredThenLive';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { BucketSnapshot, SovSnapshot } from '@/lib/types';
import type { StrategyMarket } from '@/app/api/strategy/market/route';
import type { StrategyStore } from '@/app/api/strategy/route';
import CycleDiagram from './CycleDiagram';
import {
  BUCKET_LABEL,
  BUCKET_LINK,
  BUCKETS,
  DEFAULT_SETTINGS,
  STRATEGY_LABEL,
  backtest,
  basket,
  halfLifeMonths,
  holdingsFrom,
  indicators,
  isoDay,
  normTargets,
  normalize,
  plan,
  project,
  riskScore,
  stanceOf,
  steadyState,
  weightsOf,
  type Bucket,
  type IndicatorKey,
  type LogEntry,
  type Move,
  type PlannedMove,
  type Settings,
  type Strategy,
} from '@/lib/strategy/model';

const LS_SETTINGS = 'mes-strategy:v1';
const LS_LOG = 'mes-strategy:v1:log';
const usd0 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 100 ? 2 : 0 });
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6 });
const COLOR: Record<Bucket, string> = { cash: '#22c55e', tokens: '#a855f7', sov: '#f0b90b' };
const SCOLOR: Record<Strategy, string> = { hold: '#8a94a6', cycle: '#3b82f6', signals: '#f0b90b', rebalance: '#ef4444' };
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
    // private browsing
  }
}

async function post(body: unknown): Promise<{ ok: boolean; data?: Record<string, unknown> }> {
  try {
    const res = await fetch(`${BASE_PATH}/api/strategy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = (await res.json()) as { data?: Record<string, unknown> };
    return { ok: res.ok, data: j.data };
  } catch {
    return { ok: false };
  }
}

/* ------------------------------------------------------------------ small pieces */

function Bar({ value }: { value: number }) {
  // -1..1, centre line
  const v = Math.max(-1, Math.min(1, value));
  return (
    <div className="relative h-2 w-full rounded bg-bg-border/60">
      <div className="absolute top-0 h-2 w-px bg-gray-500" style={{ left: '50%' }} />
      <div
        className={`absolute top-0 h-2 rounded ${v >= 0 ? 'bg-gain' : 'bg-loss'}`}
        style={v >= 0 ? { left: '50%', width: `${v * 50}%` } : { right: '50%', width: `${-v * 50}%` }}
      />
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, fmt }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; fmt?: (v: number) => string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between gap-2 text-gray-300">
        {label}
        <span className="tabular-nums text-gray-100">{fmt ? fmt(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[rgb(var(--c-accent))]" />
    </label>
  );
}

const inputCls = 'rounded-md border border-bg-border bg-bg px-2 py-1 text-sm text-gray-100 focus:border-accent focus:outline-none';
const btnCls = 'rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent disabled:opacity-40';
const btnPrimary = 'rounded-md border border-accent bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/25';

function AllocationBar({ w, label }: { w: Record<Bucket, number>; label: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-gray-400">{label}</p>
      <div className="flex h-5 w-full overflow-hidden rounded">
        {BUCKETS.map((b) =>
          w[b] > 0 ? (
            <div key={b} title={`${BUCKET_LABEL[b]} ${pct(w[b])}`} className="flex items-center justify-center text-[11px] font-semibold text-black/80" style={{ width: `${w[b] * 100}%`, background: COLOR[b] }}>
              {w[b] > 0.07 ? pct(w[b], 0) : ''}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ one move card */

function MoveCard({ p, onDone, onSkip }: { p: PlannedMove; onDone: (usd: number, note: string) => void; onSkip: () => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const m = p.move;
  const due = p.dueInDays <= 0;
  const dir = p.signal > 0.05 ? 'bigger' : p.signal < -0.05 ? 'smaller' : 'normal';
  const strength = Math.abs(p.signal) >= 0.6 ? 'Strong' : Math.abs(p.signal) >= 0.25 ? 'Moderate' : 'Weak';
  return (
    <div className={`panel flex flex-col gap-3 ${due && !p.skipped ? 'border-accent/70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-gray-100">
            <a href={BUCKET_LINK[m.from]} className="hover:text-accent">{BUCKET_LABEL[m.from]}</a> &rarr;{' '}
            <a href={BUCKET_LINK[m.to]} className="hover:text-accent">{BUCKET_LABEL[m.to]}</a>
          </p>
          <p className="text-xs text-gray-400">
            {m.ratePct}% of {usd0(p.eligibleUsd)} every {m.everyDays} days · {p.lastDone ? `last done ${p.lastDone}` : 'not done yet'}
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${due ? 'bg-accent/20 text-accent' : 'bg-bg-border/60 text-gray-300'}`}>
          {due ? (p.dueInDays < 0 ? `Due ${-p.dueInDays} days ago` : 'Due now') : `Next on ${p.dueOn} (${p.dueInDays} d)`}
        </span>
      </div>

      {p.skipped ? (
        <p className="text-sm text-gray-400">Skip this time: {p.skipped}.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3">
            <p className="text-3xl font-semibold tabular-nums text-gray-100">{usd0(p.usd)}</p>
            <p className="text-sm text-gray-400">
              plan&apos;s normal size {usd0(p.baseUsd)}
              {Math.abs(p.mult - 1) > 0.01 && <> · ×{p.mult.toFixed(2)}</>}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="stat-label mb-1">Sell</p>
              <ul className="flex flex-col gap-1 text-sm">
                {p.sells.map((l) => (
                  <li key={l.key} className="flex justify-between gap-2 border-b border-bg-border/60 py-0.5">
                    <span className="text-gray-200">{l.amount != null ? `${qty(l.amount)} ${l.key}` : l.name}</span>
                    <span className="tabular-nums text-gray-300">{usd2(l.usd)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="stat-label mb-1">Buy (after ~fees)</p>
              <ul className="flex flex-col gap-1 text-sm">
                {p.buys.length ? (
                  p.buys.map((l) => (
                    <li key={l.key} className="flex justify-between gap-2 border-b border-bg-border/60 py-0.5">
                      <span className="text-gray-200">{l.amount != null ? `${qty(l.amount)} ${l.key}` : l.key}</span>
                      <span className="tabular-nums text-gray-300">{usd2(l.usd)}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-gray-400">Pick where it goes under Settings &rarr; Where bought value goes</li>
                )}
              </ul>
            </div>
          </div>
        </>
      )}

      {p.reasons.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {p.reasons.map((r) => (
            <span key={r.label} className={`rounded-full border px-2 py-0.5 ${r.mult > 1.01 ? 'border-gain/50 text-gain' : r.mult < 0.99 ? 'border-loss/50 text-loss' : 'border-bg-border text-gray-400'}`}>
              {r.label} ×{r.mult.toFixed(2)}
            </span>
          ))}
          {m.tilt && (
            <span className="rounded-full border border-bg-border px-2 py-0.5 text-gray-300" title="How many of the market signals point the same way. It is NOT a chance of profit.">
              Signals: {strength} {dir === 'normal' ? '(no change)' : `→ ${dir}`} · {Math.round(p.agreement * 100)}% agree
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!p.skipped && (
          <button type="button" className={btnPrimary} onClick={() => onDone(amount ? Number(amount) : p.usd, note)}>
            ✓ Done{amount ? ` (${usd0(Number(amount))})` : ''}
          </button>
        )}
        <button type="button" className={btnCls} onClick={onSkip}>
          Skip this time
        </button>
        <button type="button" className="text-xs text-gray-400 hover:text-accent" onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide' : 'Did a different amount / add a note'}
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-2">
          <input className={`${inputCls} w-32`} inputMode="decimal" placeholder={`$ ${Math.round(p.usd)}`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} aria-label="Amount you actually moved" />
          <input className={`${inputCls} min-w-0 flex-1`} placeholder="Note (e.g. swapped on Hive Engine)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the page */

export default function StrategyPage() {
  const cash = useStoredThenLive<BucketSnapshot>('/api/cash');
  const tokens = useStoredThenLive<BucketSnapshot>('/api/tokens');
  const sov = useStoredThenLive<SovSnapshot>('/api/sov');
  const market = useSWR(`${BASE_PATH}/api/strategy/market`, (u: string) => fetchApiResult<StrategyMarket>(u), { revalidateOnFocus: false });
  const store = useSWR(`${BASE_PATH}/api/strategy`, (u: string) => fetchApiResult<StrategyStore | null>(u), { revalidateOnFocus: false });

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const [btYears, setBtYears] = useState(2);
  const [showSettings, setShowSettings] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const serverOk = useRef(false);

  // first load: the server copy (shared across devices), else this browser's, else defaults
  useEffect(() => {
    if (loaded || (store.data === undefined && !store.error)) return;
    const srv = store.data ?? null;
    serverOk.current = !!srv;
    const s = srv?.settings ?? readLS<Settings>(LS_SETTINGS);
    setSettings(normalize(s ?? DEFAULT_SETTINGS));
    setLog(srv ? srv.log : (readLS<LogEntry[]>(LS_LOG) ?? []));
    setLoaded(true);
  }, [store.data, store.error, loaded]);

  const update = useCallback((fn: (s: Settings) => Settings) => {
    setSettings((prev) => {
      const next = normalize(fn(prev));
      writeLS(LS_SETTINGS, next);
      clearTimeout(saveTimer.current);
      setSaveState('saving');
      saveTimer.current = setTimeout(async () => {
        const r = await post({ settings: next });
        setSaveState(r.ok ? 'saved' : 'local');
      }, 900);
      return next;
    });
  }, []);

  const addLog = async (e: LogEntry) => {
    const next = [e, ...log];
    setLog(next);
    writeLS(LS_LOG, next);
    const r = await post({ add: e });
    if (r.ok && Array.isArray(r.data?.log)) setLog(r.data!.log as LogEntry[]);
  };
  const removeLog = async (id: string) => {
    const next = log.filter((x) => x.id !== id);
    setLog(next);
    writeLS(LS_LOG, next);
    await post({ remove: id });
  };

  const holdings = useMemo(() => {
    if (!cash.data || !tokens.data || !sov.data) return null;
    return holdingsFrom(
      cash.data.items.map((i) => ({ key: i.key, name: i.name, valueUsd: i.valueUsd, amount: i.amount })),
      tokens.data.items.map((i) => ({ key: i.key, name: i.name, valueUsd: i.valueUsd, amount: i.amount })),
      sov.data.assets.map((a) => ({ key: a.asset, name: a.asset, valueUsd: a.valueUsd, amount: a.amount })),
    );
  }, [cash.data, tokens.data, sov.data]);

  const inds = useMemo(() => (market.data ? indicators(market.data.inputs) : []), [market.data]);
  const risk = useMemo(() => riskScore(inds, settings.weights), [inds, settings.weights]);
  const stance = stanceOf(risk.score);
  const planned = useMemo(() => (holdings ? plan(holdings, settings, inds, log) : []), [holdings, settings, inds, log]);
  const sorted = [...planned].sort((a, b) => a.dueInDays - b.dueInDays);
  const w = holdings ? weightsOf(holdings) : null;
  const ss = steadyState(settings.moves);
  const half = halfLifeMonths(settings.moves);
  const targets = normTargets(settings.targets);

  const proj = useMemo(() => {
    if (!holdings) return [];
    return project(holdings.total, settings.moves, 36).map((r) => {
      const t = r.cash + r.tokens + r.sov || 1;
      return { m: r.m, cash: (r.cash / t) * 100, tokens: (r.tokens / t) * 100, sov: (r.sov / t) * 100 };
    });
  }, [holdings, settings.moves]);

  const bt = useMemo(() => {
    if (!market.data || !holdings || !w) return null;
    const md = market.data;
    const start = Math.max(0, md.days.length - Math.round(btYears * 365));
    const days = md.days.slice(start);
    const series: Record<string, Record<string, number>> = {};
    for (const [sym, arr] of Object.entries(md.prices)) {
      const o: Record<string, number> = {};
      arr.slice(start).forEach((p, i) => {
        if (p != null) o[days[i]!] = p;
      });
      if (Object.keys(o).length) series[sym] = o;
    }
    const mixOf = (b: Bucket) => {
      const mix: Record<string, number> = {};
      for (const h of holdings.items) if (h.bucket === b && series[h.key]) mix[h.key] = h.valueUsd;
      return mix;
    };
    const sovMix = mixOf('sov');
    const tokMix = mixOf('tokens');
    const sovLine = basket(days, series, Object.keys(sovMix).length ? sovMix : { BTC: 1 });
    const tokLine = basket(days, series, Object.keys(tokMix).length ? tokMix : { HIVE: 1 });
    const btc = basket(days, series, { BTC: 1 });
    if (!sovLine || !tokLine || !btc) return null;
    const hiveBtc = days.map((d) => { const hv = series.HIVE?.[d]; const bv = series.BTC?.[d]; return hv && bv ? hv / bv : NaN; });
    for (let i = 0; i < hiveBtc.length; i++) if (!Number.isFinite(hiveBtc[i])) hiveBtc[i] = i ? hiveBtc[i - 1]! : 1;
    const inp = { days, sov: sovLine, tokens: tokLine, btc, hiveBtc, fng: md.fng.slice(start) };
    const strategies: Strategy[] = ['hold', 'cycle', 'signals', 'rebalance'];
    const results = strategies.map((s) => backtest(inp, w, settings, s));
    const step = Math.max(1, Math.floor(days.length / 260));
    const chart = days
      .map((d, i) => ({ d, ...Object.fromEntries(results.map((r) => [r.strategy, Math.round(r.values[i] ?? 0)])) }))
      .filter((_, i) => i % step === 0 || i === days.length - 1);
    return { results, chart, from: days[0], mixes: { sov: Object.keys(sovMix), tokens: Object.keys(tokMix) } };
  }, [market.data, holdings, w, settings, btYears]);

  // review numbers
  const biggest = holdings ? [...holdings.items].sort((a, b) => b.valueUsd - a.valueUsd)[0] : null;
  const topIn = (b: Bucket) => {
    if (!holdings) return null;
    const list = holdings.items.filter((h) => h.bucket === b).sort((x, y) => y.valueUsd - x.valueUsd);
    return list[0] && holdings.total[b] > 0 ? { h: list[0], share: list[0].valueUsd / holdings.total[b] } : null;
  };
  const monthlyFlows = planned.reduce<Record<Bucket, number>>(
    (acc, p) => {
      const f = 30 / p.move.everyDays;
      acc[p.move.from] -= p.baseUsd * f;
      acc[p.move.to] += p.baseUsd * f;
      return acc;
    },
    { cash: 0, tokens: 0, sov: 0 },
  );

  const pickMove = (id: string) => {
    setShowSettings(true);
    setTimeout(() => {
      const el = document.getElementById(`move-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el?.querySelector('input[type=number]') as HTMLInputElement | null)?.focus();
    }, 50);
  };

  const setMove = (id: string, patch: Partial<Move>) => update((s) => ({ ...s, moves: s.moves.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const loadingData = cash.isLoading || tokens.isLoading || sov.isLoading;
  const dataErr = (!cash.data && cash.error) || (!tokens.data && tokens.error) || (!sov.data && sov.error);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">
        Your rotation <b className="text-gray-200">Cash LP → Tokens → Store of Value → Cash LP</b> as a dated to-do list, sized from today&apos;s balances on{' '}
        <a href="https://mes.fm/cash" className="text-accent hover:underline">Cash LP</a>,{' '}
        <a href="https://mes.fm/tokens" className="text-accent hover:underline">Tokens</a> and{' '}
        <a href="https://mes.fm/sov" className="text-accent hover:underline">Store of Value</a>, with optional nudges from market signals (also on{' '}
        <a href="https://mes.fm/signals" className="text-accent hover:underline">mes.fm/signals</a>) and your target mix. It is a rules calculator, not a prediction, and not financial advice: you
        decide and make every trade yourself.
      </p>

      {/* ---------------------------------------------------- top summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel flex flex-col gap-3 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="stat-label">Followed sections</p>
            <FreshNote savedAt={cash.savedAt ?? tokens.savedAt ?? sov.savedAt} updating={cash.updating || tokens.updating || sov.updating} error={null} />
          </div>
          {loadingData && !holdings && <p className="text-sm text-gray-400">Loading your balances…</p>}
          {dataErr && !holdings && <p className="text-sm text-loss">{dataErr}</p>}
          {holdings && w && (
            <>
              <p className="text-3xl font-semibold tabular-nums text-gray-100">{usd0(holdings.all)}</p>
              <AllocationBar w={w} label="Now" />
              {settings.useTargets && <AllocationBar w={targets} label="Your targets" />}
              {ss && <AllocationBar w={ss} label="Where your % rates settle on their own (prices flat)" />}
              <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                {BUCKETS.map((b) => (
                  <span key={b} className="flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLOR[b] }} />
                    {BUCKET_LABEL[b]} {usd0(holdings.total[b])}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="panel flex flex-col gap-2">
          <p className="stat-label">Market mood</p>
          {market.isLoading && <p className="text-sm text-gray-400">Loading signals…</p>}
          {market.error && !market.data && <p className="text-sm text-loss">{String(market.error.message ?? market.error)}</p>}
          {market.data && (
            <>
              <p className={`text-lg font-semibold ${stance.tone === 'buy' ? 'text-gain' : stance.tone === 'sell' ? 'text-loss' : 'text-gray-100'}`}>{stance.label}</p>
              <Bar value={risk.score} />
              <p className="text-xs text-gray-400">
                Score {risk.score >= 0 ? '+' : ''}
                {risk.score.toFixed(2)} (−1 greed … +1 fear) · {Math.round(risk.agreement * 100)}% of the {risk.used} signals agree. Agreement is how much the signals point the same way, not a
                chance of profit.
              </p>
              <a href="https://mes.fm/signals" className="text-xs text-accent hover:underline">
                All market signals →
              </a>
            </>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- moves */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-100">What to do</h2>
          <p className="text-xs text-gray-500">
            {sorted.filter((p) => p.dueInDays <= 0 && !p.skipped).length} due now · amounts follow today&apos;s balances
          </p>
        </div>
        {!holdings && <p className="text-sm text-gray-400">The moves appear once your balances have loaded.</p>}
        <div className="grid gap-4 lg:grid-cols-3">
          {sorted.map((p) => (
            <MoveCard
              key={p.move.id}
              p={p}
              onDone={(usd, note) => addLog({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, moveId: p.move.id, date: isoDay(Date.now()), usd, from: p.move.from, to: p.move.to, note: note || undefined })}
              onSkip={() => addLog({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, moveId: p.move.id, date: isoDay(Date.now()), usd: 0, from: p.move.from, to: p.move.to, skipped: true })}
            />
          ))}
        </div>
      </section>

      {holdings && <CycleDiagram settings={settings} totals={holdings.total} all={holdings.all} planned={planned} onChange={(d) => update((s) => ({ ...s, diagram: d }))} onPickMove={pickMove} />}

      {/* ---------------------------------------------------- signals */}
      <section className="panel flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="stat-label">Signals and how much each one counts</p>
          {market.data && <p className="text-xs text-gray-500">Updated {new Date(market.data.asOf).toLocaleString()}</p>}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {inds.map((i) => (
            <div key={i.key} className="flex flex-col gap-1 border-b border-bg-border/60 pb-3">
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-gray-200">{i.name}</span>
                <span className="tabular-nums text-gray-100">{i.value}</span>
              </div>
              <Bar value={i.score} />
              <p className="text-xs text-gray-400">{i.note}</p>
              <Slider label="Weight" value={settings.weights[i.key]} min={0} max={3} step={0.25} onChange={(v) => update((s) => ({ ...s, weights: { ...s.weights, [i.key as IndicatorKey]: v } }))} fmt={(v) => (v === 0 ? 'off' : `${v}×`)} />
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Slider label="How much signals change a move" value={settings.tiltStrength} min={0} max={1} step={0.05} onChange={(v) => update((s) => ({ ...s, tiltStrength: v }))} fmt={(v) => (v === 0 ? 'off' : `±${Math.round(v * 100)}%`)} />
          <Slider label="How much targets change a move" value={settings.driftWeight} min={0} max={1} step={0.05} onChange={(v) => update((s) => ({ ...s, driftWeight: v }))} fmt={(v) => (v === 0 ? 'off' : `${Math.round(v * 100)}%`)} />
          <Slider label="Never more than" value={settings.maxMult} min={1} max={5} step={0.25} onChange={(v) => update((s) => ({ ...s, maxMult: v }))} fmt={(v) => `${v}× the normal size`} />
        </div>
      </section>

      {/* ---------------------------------------------------- settings */}
      <section className="panel flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-left" onClick={() => setShowSettings((o) => !o)} aria-expanded={showSettings}>
            <span className="stat-label">Settings {showSettings ? '▾' : '▸'}</span>
          </button>
          <span className="text-xs text-gray-500">
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved (all your devices)' : saveState === 'local' ? 'Saved in this browser only' : serverOk.current ? 'Saved on mes.fm' : ''}
          </span>
        </div>
        {showSettings && (
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-200">Moves</p>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[620px]">
                  <thead>
                    <tr>
                      <th>On</th>
                      <th>From</th>
                      <th>To</th>
                      <th>% each time</th>
                      <th>Every (days)</th>
                      <th>Signals</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {settings.moves.map((m) => (
                      <tr key={m.id} id={`move-${m.id}`}>
                        <td>
                          <input type="checkbox" checked={m.on} onChange={(e) => setMove(m.id, { on: e.target.checked })} aria-label="Move on" />
                        </td>
                        <td>
                          <select className={inputCls} value={m.from} onChange={(e) => setMove(m.id, { from: e.target.value as Bucket })}>
                            {BUCKETS.map((b) => (
                              <option key={b} value={b}>{BUCKET_LABEL[b]}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select className={inputCls} value={m.to} onChange={(e) => setMove(m.id, { to: e.target.value as Bucket })}>
                            {BUCKETS.map((b) => (
                              <option key={b} value={b}>{BUCKET_LABEL[b]}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input type="number" className={`${inputCls} w-20`} min={0} max={50} step={0.25} value={m.ratePct} onChange={(e) => setMove(m.id, { ratePct: Number(e.target.value) })} />
                        </td>
                        <td>
                          <input type="number" className={`${inputCls} w-20`} min={1} max={365} value={m.everyDays} onChange={(e) => setMove(m.id, { everyDays: Number(e.target.value) })} />
                        </td>
                        <td>
                          <input type="checkbox" checked={m.tilt} onChange={(e) => setMove(m.id, { tilt: e.target.checked })} aria-label="Let signals change this move" />
                        </td>
                        <td>
                          <button type="button" className="text-xs text-gray-400 hover:text-loss" onClick={() => update((s) => ({ ...s, moves: s.moves.filter((x) => x.id !== m.id) }))}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={btnCls} onClick={() => update((s) => ({ ...s, moves: [...s.moves, { id: `m${Date.now().toString(36)}`, from: 'cash', to: 'sov', ratePct: 2, everyDays: 30, tilt: true, on: true }] }))}>
                  + Add a move
                </button>
                <button type="button" className={btnCls} onClick={() => update((s) => ({ ...s, moves: DEFAULT_SETTINGS.moves.map((m) => ({ ...m })) }))}>
                  Back to 4% / 3% / 2%
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-gray-200">Targets</p>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={settings.useTargets} onChange={(e) => update((s) => ({ ...s, useTargets: e.target.checked }))} /> Nudge moves toward a target mix
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {BUCKETS.map((b) => (
                    <label key={b} className="flex flex-col gap-1 text-xs text-gray-400">
                      {BUCKET_LABEL[b]} %
                      <input type="number" className={inputCls} min={0} max={100} value={settings.targets[b]} onChange={(e) => update((s) => ({ ...s, targets: { ...s.targets, [b]: Number(e.target.value) } }))} />
                    </label>
                  ))}
                </div>
                {ss && (
                  <button type="button" className={`${btnCls} self-start`} onClick={() => update((s) => ({ ...s, targets: { cash: Math.round(ss.cash * 100), tokens: Math.round(ss.tokens * 100), sov: Math.round(ss.sov * 100) } }))}>
                    Use the mix my rates settle at
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Sell only from holdings worth at least ($)
                  <input type="number" className={inputCls} min={0} value={settings.minHoldingUsd} onChange={(e) => update((s) => ({ ...s, minHoldingUsd: Number(e.target.value) }))} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Skip moves smaller than ($)
                  <input type="number" className={inputCls} min={0} value={settings.minTradeUsd} onChange={(e) => update((s) => ({ ...s, minTradeUsd: Number(e.target.value) }))} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Fees + slippage per trade (%)
                  <input type="number" className={inputCls} min={0} max={5} step={0.05} value={settings.feePct} onChange={(e) => update((s) => ({ ...s, feePct: Number(e.target.value) }))} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Cash interest a year (HBD savings %, backtest)
                  <input type="number" className={inputCls} min={0} max={50} step={0.5} value={settings.cashAprPct} onChange={(e) => update((s) => ({ ...s, cashAprPct: Number(e.target.value) }))} />
                </label>
                <label className="col-span-2 flex flex-col gap-1 text-xs text-gray-400">
                  Never sell (comma separated)
                  <input className={inputCls} defaultValue={settings.keep.join(', ')} onBlur={(e) => update((s) => ({ ...s, keep: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))} />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-gray-200">Where bought value goes</p>
              <p className="mb-2 text-xs text-gray-400">Shares per section, e.g. Tokens: HIVE 70, ETH 30. Leave a section empty to spread buys over what you already hold there (worth ${settings.minHoldingUsd}+).</p>
              <div className="grid gap-3 md:grid-cols-3">
                {BUCKETS.map((b) => (
                  <DestEditor key={b} bucket={b} value={settings.dest[b]} suggestions={holdings?.items.filter((h) => h.bucket === b).map((h) => h.key) ?? []} onChange={(v) => update((s) => ({ ...s, dest: { ...s.dest, [b]: v } }))} />
                ))}
              </div>
            </div>
            <button
              type="button"
              className={`${btnCls} self-start`}
              onClick={() => {
                if (confirm('Put every setting back to the starting values? Your log of done moves is kept.')) update(() => ({ ...DEFAULT_SETTINGS, diagram: settings.diagram }));
              }}
            >
              Reset all settings
            </button>
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- review */}
      {holdings && w && (
        <section className="panel flex flex-col gap-3">
          <p className="stat-label">Review of the plan (worked out from your numbers)</p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-gray-300">
            {ss && (
              <li>
                Left alone with flat prices, your rates settle at <b className="text-gray-100">{pct(ss.cash, 0)} Cash LP / {pct(ss.tokens, 0)} Tokens / {pct(ss.sov, 0)} Store of Value</b>
                {half ? <>, closing half of any gap in about {half} months</> : null}. A fixed-% cycle always has such a resting mix: each section ends up in proportion to 1 ÷ the rate leaving it. Right
                now you are at {pct(w.cash, 0)} / {pct(w.tokens, 0)} / {pct(w.sov, 0)}, so per month the plan moves about{' '}
                {BUCKETS.map((b) => `${monthlyFlows[b] >= 0 ? '+' : '−'}${usd0(Math.abs(monthlyFlows[b]))} ${BUCKET_LABEL[b]}`).join(', ')}.
                {ss.sov < w.sov - 0.05 && (
                  <> That means it is slowly <b className="text-gray-100">shrinking Store of Value</b> toward {pct(ss.sov, 0)}. If you want Store of Value to stay the biggest part, lower the Store of Value → Cash rate or set targets.</>
                )}
              </li>
            )}
            {biggest && biggest.valueUsd / holdings.all > 0.3 && (
              <li>
                <b className="text-gray-100">{biggest.key}</b> alone is {pct(biggest.valueUsd / holdings.all, 0)} of everything followed here. The cycle moves 2–4% a month, so price moves of your biggest coins
                will matter far more than these rates. Decide on purpose how big any one coin may be.
              </li>
            )}
            {(['tokens', 'sov'] as Bucket[]).map((b) => {
              const t = topIn(b);
              return t && t.share > 0.6 ? (
                <li key={b}>
                  {t.h.key} is {pct(t.share, 0)} of {BUCKET_LABEL[b]}{b === 'sov' && t.h.key !== 'BTC' ? ' – it behaves much more like a large token than like Bitcoin, so this section is less of a "store of value" than its name suggests' : ''}.
                </li>
              ) : null;
            })}
            <li>
              Cash LP is your dry powder for buying fear. It is {pct(w.cash, 0)} of the total{ss ? <> against the {pct(ss.cash, 0)} your rates aim for, which is why the plan sends more into it than out right now</> : null}.
              HBD in savings earns interest while it waits, so a bigger cash share costs less than it seems, and it is what lets you buy more when the signals say fear.
            </li>
            <li>
              Signals change a move by at most ±{Math.round(settings.tiltStrength * 100)}% here. In the backtest below they barely change the result either way: at a few % a month, <i>what</i> you hold matters far
              more than the timing. Treat them as a tie-breaker (skip selling Store of Value in a panic, buy a little extra), not a crystal ball.
            </li>
            <li>
              Taxes (Canada): every crypto-to-crypto swap is a disposal, so each move is a taxable event at your ACB, and a loss is denied if you buy the same coin back within 30 days before or after (superficial
              loss). Your <a href="https://mes.fm/taxes" className="text-accent hover:underline">Taxes page</a> picks the trades up automatically.
            </li>
          </ul>
        </section>
      )}

      {/* ---------------------------------------------------- projection */}
      {proj.length > 0 && (
        <section className="panel">
          <p className="stat-label mb-2">Mix over the next 3 years if prices stayed flat</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={proj} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="rgb(var(--c-border))" strokeDasharray="3 3" />
                <XAxis dataKey="m" stroke="#8a94a6" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${v} mo`} />
                <YAxis stroke="#8a94a6" tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} width={42} />
                <Tooltip {...tipStyle} labelFormatter={(v: number) => `Month ${v}`} formatter={(v: number, k: string) => [`${v.toFixed(1)}%`, BUCKET_LABEL[k as Bucket]]} />
                <Legend formatter={(k: string) => BUCKET_LABEL[k as Bucket]} />
                {BUCKETS.map((b) => (
                  <Line key={b} type="monotone" dataKey={b} stroke={COLOR[b]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------- backtest */}
      <section className="panel flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="stat-label">Backtest: $10,000 in today&apos;s mix, then each way of moving</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((y) => (
              <button key={y} type="button" className={`${btnCls} ${btYears === y ? 'border-accent text-accent' : ''}`} onClick={() => setBtYears(y)}>
                {y} yr
              </button>
            ))}
          </div>
        </div>
        {!bt && <p className="text-sm text-gray-400">{market.isLoading || !holdings ? 'Loading price history…' : 'Not enough price history for these coins.'}</p>}
        {bt && (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={bt.chart} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="rgb(var(--c-border))" strokeDasharray="3 3" />
                  <XAxis dataKey="d" stroke="#8a94a6" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(0, 7)} minTickGap={40} />
                  <YAxis stroke="#8a94a6" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} width={46} />
                  <Tooltip {...tipStyle} formatter={(v: number, k: string) => [usd0(v), STRATEGY_LABEL[k as Strategy]]} />
                  <Legend formatter={(k: string) => STRATEGY_LABEL[k as Strategy]} />
                  {bt.results.map((r) => (
                    <Line key={r.strategy} type="monotone" dataKey={r.strategy} stroke={SCOLOR[r.strategy]} strokeWidth={r.strategy === 'signals' ? 2.5 : 1.75} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[520px]">
                <thead>
                  <tr>
                    <th>Way</th>
                    <th>End value</th>
                    <th>Worst drop</th>
                    <th>Trades</th>
                    <th>Fees</th>
                  </tr>
                </thead>
                <tbody>
                  {[...bt.results].sort((a, b) => b.final - a.final).map((r) => (
                    <tr key={r.strategy}>
                      <td className="text-gray-200">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SCOLOR[r.strategy] }} />
                        {STRATEGY_LABEL[r.strategy]}
                      </td>
                      <td className="tabular-nums">{usd0(r.final)}</td>
                      <td className="tabular-nums text-loss">{r.maxDrawdownPct.toFixed(1)}%</td>
                      <td className="tabular-nums">{r.trades}</td>
                      <td className="tabular-nums">{usd0(r.feesUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              From {bt.from}. Store of Value priced as today&apos;s mix of {bt.mixes.sov.join(' + ') || 'BTC'}, Tokens as {bt.mixes.tokens.join(' + ') || 'HIVE'} (coins without free price history are left out),
              Cash LP at {settings.cashAprPct}% a year. Past signals used: fear &amp; greed, Bitcoin vs its 200-day average, distance from the high, HIVE vs BTC (perp funding and stock fear &amp; greed have no long
              free history). One price path is not proof: treat differences of a few % as noise.
            </p>
          </>
        )}
      </section>

      {/* ---------------------------------------------------- log */}
      <section className="panel flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="stat-label">Log of moves</p>
          {log.length > 0 && (
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={() => {
                const rows = [['date', 'from', 'to', 'usd', 'skipped', 'note'], ...log.map((e) => [e.date, BUCKET_LABEL[e.from], BUCKET_LABEL[e.to], e.usd.toFixed(2), e.skipped ? 'yes' : '', (e.note ?? '').replace(/"/g, '""')])];
                const blob = new Blob([rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'mes-strategy-log.csv';
                a.click();
              }}
            >
              Download CSV
            </button>
          )}
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing yet. Press ✓ Done on a move after you make it; that also sets when it is next due.</p>
        ) : (
          <ul className="flex flex-col text-sm">
            {log.slice(0, 60).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-bg-border/60 py-1.5">
                <span className="text-gray-300">
                  <span className="tabular-nums text-gray-400">{e.date}</span> · {BUCKET_LABEL[e.from]} → {BUCKET_LABEL[e.to]} ·{' '}
                  {e.skipped ? <span className="text-gray-500">skipped</span> : <b className="text-gray-100">{usd0(e.usd)}</b>}
                  {e.note && <span className="text-gray-500"> · {e.note}</span>}
                </span>
                <button type="button" className="text-xs text-gray-500 hover:text-loss" onClick={() => removeLog(e.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function DestEditor({ bucket, value, suggestions, onChange }: { bucket: Bucket; value: Record<string, number>; suggestions: string[]; onChange: (v: Record<string, number>) => void }) {
  const [sym, setSym] = useState('');
  const entries = Object.entries(value);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-bg-border p-3">
      <p className="text-sm text-gray-200">{BUCKET_LABEL[bucket]}</p>
      {entries.length === 0 && <p className="text-xs text-gray-500">Spread over what you hold</p>}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 text-sm">
          <span className="w-20 truncate text-gray-200">{k}</span>
          <input type="number" className={`${inputCls} w-20`} min={0} value={v} onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })} aria-label={`${k} share`} />
          <span className="text-xs text-gray-500">{total > 0 ? pct(v / total, 0) : ''}</span>
          <button
            type="button"
            className="ml-auto text-xs text-gray-500 hover:text-loss"
            onClick={() => {
              const n = { ...value };
              delete n[k];
              onChange(n);
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input className={`${inputCls} w-24`} list={`dest-${bucket}`} placeholder="Symbol" value={sym} onChange={(e) => setSym(e.target.value.toUpperCase())} aria-label={`Add a coin to ${BUCKET_LABEL[bucket]}`} />
        <datalist id={`dest-${bucket}`}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          className={btnCls}
          disabled={!sym}
          onClick={() => {
            onChange({ ...value, [sym]: 50 });
            setSym('');
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
