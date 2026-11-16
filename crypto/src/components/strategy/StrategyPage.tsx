'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import FreshNote from '@/components/FreshNote';
import { useStoredThenLive } from '@/hooks/useStoredThenLive';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { BucketSnapshot, LpSnapshot, SovSnapshot } from '@/lib/types';
import type { StrategyMarket } from '@/app/api/strategy/market/route';
import type { StrategyStore } from '@/app/api/strategy/route';
import CycleDiagram from './CycleDiagram';
import {
  BUCKET_LABEL,
  BUCKET_LINK,
  BUCKETS,
  DEFAULT_MOVES,
  DEFAULT_SETTINGS,
  STRATEGY_LABEL,
  backtest,
  basket,
  halfLifeMonths,
  holdingsFrom,
  indicators,
  isoDay,
  lpStatus,
  topIssues,
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
  type Leg,
  type LpInfo,
  type Note,
  type Risk,
  type LogEntry,
  type Move,
  type PlannedMove,
  type Settings,
  type Strategy,
} from '@/lib/strategy/model';

const LS_SETTINGS = 'mes-strategy:v1';
const LS_LOG = 'mes-strategy:v1:log';
const usd0 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cad0 = (v: number) => `${v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 })} CAD`;
const usd2 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v < 100 ? 2 : 0 });
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6 });
const COLOR: Record<Bucket, string> = { cash: '#22c55e', lp: '#3b82f6', tokens: '#a855f7', sov: '#f0b90b' };
const SCOLOR: Record<Strategy, string> = { hold: '#8a94a6', cycle: '#06b6d4', signals: '#f0b90b', rebalance: '#ef4444' };
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

const NOTE_STYLE: Record<Note['tone'], { cls: string; icon: string }> = {
  warn: { cls: 'border-loss/40 bg-loss/10 text-gray-100', icon: '⚠' },
  tip: { cls: 'border-gain/40 bg-gain/10 text-gray-100', icon: '✓' },
  info: { cls: 'border-bg-border bg-bg/40 text-gray-300', icon: 'i' },
};

function Notes({ notes }: { notes: Note[] }) {
  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {notes.map((n, i) => (
        <li key={i} className={`flex gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-relaxed ${NOTE_STYLE[n.tone].cls}`}>
          <span className="font-bold" aria-hidden="true">{NOTE_STYLE[n.tone].icon}</span>
          <span>{n.text}</span>
        </li>
      ))}
    </ul>
  );
}

function MoveCard({ p, risk, onDone, onSkip }: { p: PlannedMove; risk: Risk; onDone: (usd: number, note: string) => void; onSkip: () => void }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const m = p.move;
  const due = p.dueInDays <= 0;
  const groups = new Map<Bucket, Leg[]>();
  for (const l of p.buys) groups.set(l.bucket ?? m.to, [...(groups.get(l.bucket ?? m.to) ?? []), l]);
  return (
    <div className={`panel flex flex-col gap-3 ${due && !p.skipped ? 'border-accent/70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-base font-semibold text-gray-100">
            <a href={BUCKET_LINK[m.from]} className="hover:text-accent">{BUCKET_LABEL[m.from]}</a> &rarr;{' '}
            <a href={BUCKET_LINK[m.to]} className="hover:text-accent">{BUCKET_LABEL[m.to]}</a>
            {m.split && m.split.pct > 0 && (
              <>
                {' '}+ <a href={BUCKET_LINK[m.split.to]} className="hover:text-accent">{BUCKET_LABEL[m.split.to]}</a>
              </>
            )}
          </p>
          <p className="text-xs text-gray-400">
            {m.kind === 'profit' ? `the profit of ${BUCKET_LABEL[m.from]}` : `${m.ratePct}% of ${usd0(p.eligibleUsd)}`}
            {m.split && m.split.pct > 0 ? ` (${100 - m.split.pct}% / ${m.split.pct}%)` : ''} every {m.everyDays} days · {p.lastDone ? `last done ${p.lastDone}` : 'not done yet'}
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
            {m.kind === 'pct' && (
              <p className="text-sm text-gray-400">
                normal size {usd0(p.baseUsd)}
                {Math.abs(p.mult - 1) > 0.01 && <> · ×{p.mult.toFixed(2)}</>}
              </p>
            )}
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
              {p.buys.length ? (
                [...groups.entries()].map(([b, legs]) => (
                  <div key={b} className="mb-1">
                    {groups.size > 1 && <p className="text-xs text-gray-500">{BUCKET_LABEL[b]}</p>}
                    <ul className="flex flex-col gap-1 text-sm">
                      {legs.map((l) => (
                        <li key={`${b}-${l.key}`} className="flex justify-between gap-2 border-b border-bg-border/60 py-0.5">
                          <span className="text-gray-200">{l.amount != null ? `${qty(l.amount)} ${l.key}` : l.key}</span>
                          <span className="tabular-nums text-gray-300">{usd2(l.usd)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">Pick where it goes under Settings &rarr; Where bought value goes</p>
              )}
            </div>
          </div>
        </>
      )}

      {p.reasons.length > 0 && !p.skipped && (
        <div className="flex flex-col gap-1 text-xs">
          {p.reasons.map((r) => (
            <p key={r.label} className="text-gray-300">
              <span className={`mr-1 rounded-full border px-2 py-0.5 font-semibold ${r.mult > 1.01 ? 'border-gain/50 text-gain' : r.mult < 0.99 ? 'border-loss/50 text-loss' : 'border-bg-border text-gray-400'}`}>
                {r.label}: {r.mult > 1.01 ? `+${Math.round((r.mult - 1) * 100)}%` : r.mult < 0.99 ? `−${Math.round((1 - r.mult) * 100)}%` : 'no change'}
              </span>
              {r.why}
              {r.label === 'Market mood' && risk.used > 0 && (
                <span className="text-gray-500"> ({risk.agreeCount} of {risk.used} signals agree)</span>
              )}
            </p>
          ))}
        </div>
      )}

      <Notes notes={p.notes} />

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
  const lpq = useStoredThenLive<LpSnapshot>('/api/lp');
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
    return holdingsFrom({
      cash: cash.data.items.map((i) => ({ key: i.key, name: i.name, valueUsd: i.valueUsd, amount: i.amount })),
      lp: lpq.data ? [{ key: 'ETH/BNB LP', name: lpq.data.positions[0]?.label ?? 'Liquidity position', valueUsd: lpq.data.totalUsd, amount: null }] : [],
      tokens: tokens.data.items.map((i) => ({ key: i.key, name: i.name, valueUsd: i.valueUsd, amount: i.amount })),
      sov: sov.data.assets.map((a) => ({ key: a.asset, name: a.asset, valueUsd: a.valueUsd, amount: a.amount })),
    });
  }, [cash.data, tokens.data, sov.data, lpq.data]);

  const lpInfo = useMemo<LpInfo | null>(() => {
    const d = lpq.data;
    if (!d) return null;
    const legs = new Map<string, { symbol: string; valueUsd: number; amount: number }>();
    for (const pos of d.positions)
      for (const l of pos.legs) {
        const sym = l.symbol === 'WBNB' ? 'BNB' : l.symbol === 'WETH' ? 'ETH' : l.symbol;
        const x = legs.get(sym) ?? { symbol: sym, valueUsd: 0, amount: 0 };
        x.valueUsd += l.valueUsd ?? 0;
        x.amount += l.amount;
        legs.set(sym, x);
      }
    const details = d.positions.map((x) => (x.detail ?? '').toLowerCase());
    const inRange = details.some((t) => t.includes('out of range')) ? false : details.some((t) => t.includes('in range')) ? true : null;
    return { valueUsd: d.totalUsd, cadRate: d.cadRate ?? cash.data?.cadRate ?? null, inRange, legs: [...legs.values()] };
  }, [lpq.data, cash.data]);

  const inds = useMemo(() => (market.data ? indicators(market.data.inputs) : []), [market.data]);
  const risk = useMemo(() => riskScore(inds, settings.weights), [inds, settings.weights]);
  const stance = stanceOf(risk.score);
  const planned = useMemo(() => (holdings ? plan(holdings, settings, inds, log, { lp: lpInfo }) : []), [holdings, settings, inds, log, lpInfo]);
  const lps = useMemo(() => lpStatus(settings, log, lpInfo), [settings, log, lpInfo]);
  const issues = holdings ? topIssues(holdings, settings, planned, risk, lpInfo, lps) : [];
  const sorted = [...planned].sort((a, b) => a.dueInDays - b.dueInDays);
  const w = holdings ? weightsOf(holdings) : null;
  // Liquidity only gives back its profit, so with flat prices it would soak everything up: leave it out
  const loopMoves = settings.moves.filter((m) => m.from !== 'lp' && m.to !== 'lp').map((m) => (m.split?.to === 'lp' ? { ...m, split: null } : m));
  const ss = (() => {
    const r = steadyState(loopMoves);
    if (!r) return null;
    const t = r.cash + r.tokens + r.sov || 1;
    return { cash: r.cash / t, lp: 0, tokens: r.tokens / t, sov: r.sov / t };
  })();
  const half = halfLifeMonths(loopMoves);
  const targets = normTargets(settings.targets);

  const proj = useMemo(() => {
    if (!holdings) return [];
    return project(holdings.total, settings.moves, 36).map((r) => {
      const t = r.cash + r.lp + r.tokens + r.sov || 1;
      return { m: r.m, cash: (r.cash / t) * 100, lp: (r.lp / t) * 100, tokens: (r.tokens / t) * 100, sov: (r.sov / t) * 100 };
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
    const lpMix: Record<string, number> = {};
    for (const l of lpInfo?.legs ?? []) if (series[l.symbol]) lpMix[l.symbol] = l.valueUsd;
    const lpLine = basket(days, series, Object.keys(lpMix).length ? lpMix : { ETH: 1, BNB: 1 });
    const btc = basket(days, series, { BTC: 1 });
    if (!sovLine || !tokLine || !btc || !lpLine) return null;
    const hiveBtc = days.map((d) => { const hv = series.HIVE?.[d]; const bv = series.BTC?.[d]; return hv && bv ? hv / bv : NaN; });
    for (let i = 0; i < hiveBtc.length; i++) if (!Number.isFinite(hiveBtc[i])) hiveBtc[i] = i ? hiveBtc[i - 1]! : 1;
    const inp = { days, sov: sovLine, tokens: tokLine, lp: lpLine, btc, hiveBtc, fng: md.fng.slice(start) };
    const strategies: Strategy[] = ['hold', 'cycle', 'signals', 'rebalance'];
    const results = strategies.map((s) => backtest(inp, w, settings, s));
    const step = Math.max(1, Math.floor(days.length / 260));
    const chart = days
      .map((d, i) => ({ d, ...Object.fromEntries(results.map((r) => [r.strategy, Math.round(r.values[i] ?? 0)])) }))
      .filter((_, i) => i % step === 0 || i === days.length - 1);
    return { results, chart, from: days[0], mixes: { sov: Object.keys(sovMix), tokens: Object.keys(tokMix), lp: Object.keys(lpMix) } };
  }, [market.data, holdings, w, settings, btYears, lpInfo]);

  // review numbers
  const biggest = holdings ? [...holdings.items].sort((a, b) => b.valueUsd - a.valueUsd)[0] : null;
  const topIn = (b: Bucket) => {
    if (!holdings) return null;
    const list = holdings.items.filter((h) => h.bucket === b).sort((x, y) => y.valueUsd - x.valueUsd);
    return list[0] && holdings.total[b] > 0 ? { h: list[0], share: list[0].valueUsd / holdings.total[b] } : null;
  };
  const monthlyFlows = planned.reduce<Record<Bucket, number>>(
    (acc, p) => {
      if (p.move.kind === 'profit') return acc;
      const f = 30 / p.move.everyDays;
      const s2 = p.move.split ? p.move.split.pct / 100 : 0;
      acc[p.move.from] -= p.baseUsd * f;
      acc[p.move.to] += p.baseUsd * f * (1 - s2);
      if (p.move.split) acc[p.move.split.to] += p.baseUsd * f * s2;
      return acc;
    },
    { cash: 0, lp: 0, tokens: 0, sov: 0 },
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
  const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const doneEntry = (p: PlannedMove, usd: number, note: string): LogEntry => {
    const m = p.move;
    const toLp = m.to === 'lp' ? usd : m.split?.to === 'lp' ? (usd * m.split.pct) / 100 : 0;
    return { id: newId(), moveId: m.id, date: isoDay(Date.now()), usd, from: m.from, to: m.to, cad: lpInfo?.cadRate ?? cash.data?.cadRate ?? undefined, lpUsd: toLp || undefined, note: note || undefined };
  };
  const dataErr = (!cash.data && cash.error) || (!tokens.data && tokens.error) || (!sov.data && sov.error);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">
        Your rotation <b className="text-gray-200">Cash LP → Tokens / Liquidity → Store of Value → Cash LP</b> as a dated to-do list, sized from today&apos;s balances on{' '}
        <a href="https://mes.fm/cash" className="text-accent hover:underline">Cash LP</a>,{' '}
        <a href="https://mes.fm/lp" className="text-accent hover:underline">Liquidity</a>,{' '}
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
            <FreshNote savedAt={cash.savedAt ?? tokens.savedAt ?? sov.savedAt ?? lpq.savedAt} updating={cash.updating || tokens.updating || sov.updating || lpq.updating} error={null} />
          </div>
          {loadingData && !holdings && <p className="text-sm text-gray-400">Loading your balances…</p>}
          {dataErr && !holdings && <p className="text-sm text-loss">{dataErr}</p>}
          {holdings && w && (
            <>
              <p className="text-3xl font-semibold tabular-nums text-gray-100">{usd0(holdings.all)}</p>
              <AllocationBar w={w} label="Now" />
              {settings.useTargets && <AllocationBar w={targets} label="Your targets" />}
              {ss && <AllocationBar w={ss} label="Where your % rates settle on their own (prices flat, Liquidity left out)" />}
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
              <p className="text-sm text-gray-300">{stance.plain}</p>
              <p className="text-xs text-gray-400">
                {risk.agreeCount} of {risk.used} signals agree.
              </p>
              <details className="text-xs text-gray-400">
                <summary className="cursor-pointer text-gray-300 hover:text-accent">What does "market mood" mean?</summary>
                <div className="mt-1 flex flex-col gap-1.5">
                  <p>
                    A few public numbers (fear &amp; greed, Bitcoin vs its average price, how far it is below its record ...) are combined into one reading from greedy (left) to fearful (right).
                  </p>
                  <p>
                    The old rule of thumb: buy when others are scared, take profits when they are greedy. So in a fearful market the plan makes <b>buys</b> a bit bigger and <b>sales</b> a bit
                    smaller, and the other way round when people are greedy. At most ±{Math.round(settings.tiltStrength * 100)}% (change it under the signals list).
                  </p>
                  <p>&quot;3 of 5 agree&quot; only says how many readings point the same way. It is not a chance of making money: markets can stay scared, or greedy, for months.</p>
                </div>
              </details>
              <a href="https://mes.fm/signals" className="text-xs text-accent hover:underline">
                All market signals →
              </a>
            </>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------- do these first */}
      {issues.length > 0 && (
        <section className="panel flex flex-col gap-2 border-accent/60">
          <p className="stat-label">Do these first</p>
          <ol className="flex flex-col gap-2">
            {issues.map((it, i) => (
              <li key={it.title} className={`flex gap-3 rounded-lg border px-3 py-2 ${it.tone === 'warn' ? 'border-loss/40 bg-loss/10' : 'border-gain/40 bg-gain/10'}`}>
                <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold ${it.tone === 'warn' ? 'bg-loss text-white' : 'bg-gain text-white'}`}>{i + 1}</span>
                <span className="text-sm">
                  <b className="text-gray-100">{it.title}.</b> <span className="text-gray-300">{it.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {lpInfo && (
        <a href="https://mes.fm/lp" className="panel flex flex-col gap-2 transition hover:border-accent">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="stat-label">Liquidity profit · ETH/BNB on PancakeSwap</p>
            <span className={`text-xs font-semibold ${lpInfo.inRange === false ? 'text-loss' : 'text-gray-400'}`}>
              {lpInfo.inRange === false ? 'OUT OF RANGE · earning no fees' : lpInfo.inRange ? 'In range · earning fees' : ''}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className={`text-3xl font-semibold tabular-nums ${lps.profitCad == null ? 'text-gray-100' : lps.profitCad >= 0 ? 'text-gain' : 'text-loss'}`}>
              {lps.profitCad == null ? '—' : `${lps.profitCad >= 0 ? '+' : '−'}${cad0(Math.abs(lps.profitCad))}`}
              {lps.profitPct != null && <span className="ml-2 text-lg">({lps.profitPct >= 0 ? '+' : ''}{(lps.profitPct * 100).toFixed(1)}%)</span>}
            </p>
            <p className="text-sm text-gray-400">
              worth {lps.valueCad != null ? cad0(lps.valueCad) : '—'} ({usd0(lpInfo.valueUsd)}) · put in {cad0(lps.basisCad)}
              {Math.abs(lps.basisCad - settings.lpBasisCad) > 0.5 && <> ({cad0(settings.lpBasisCad)} at the start + moves you logged)</>}
            </p>
          </div>
          <p className="text-xs text-gray-500">Value includes unharvested CAKE. The cost is in CAD; change the starting amount under Settings.</p>
        </a>
      )}

      {/* ---------------------------------------------------- moves */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-gray-100">What to do</h2>
          <p className="text-xs text-gray-500">
            {sorted.filter((p) => p.dueInDays <= 0 && !p.skipped).length} due now · amounts follow today&apos;s balances
          </p>
        </div>
        {!holdings && <p className="text-sm text-gray-400">The moves appear once your balances have loaded.</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {sorted.map((p) => (
            <MoveCard
              key={p.move.id}
              p={p}
              risk={risk}
              onDone={(usd, note) => addLog(doneEntry(p, usd, note))}
              onSkip={() => addLog({ id: newId(), moveId: p.move.id, date: isoDay(Date.now()), usd: 0, from: p.move.from, to: p.move.to, skipped: true })}
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
              <p className="text-sm text-gray-300">{i.plain}</p>
              <p className="text-xs text-gray-500">{i.note}</p>
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
                <table className="data-table min-w-[820px]">
                  <thead>
                    <tr>
                      <th>On</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Also to (share)</th>
                      <th>How much</th>
                      <th>Every (days)</th>
                      <th>Market mood</th>
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
                          <div className="flex items-center gap-1">
                            <select className={inputCls} value={m.split?.to ?? ''} onChange={(e) => setMove(m.id, { split: e.target.value ? { to: e.target.value as Bucket, pct: m.split?.pct ?? 50 } : null })} aria-label="Second destination">
                              <option value="">—</option>
                              {BUCKETS.filter((b) => b !== m.from && b !== m.to).map((b) => (
                                <option key={b} value={b}>{BUCKET_LABEL[b]}</option>
                              ))}
                            </select>
                            {m.split && (
                              <input type="number" className={`${inputCls} w-16`} min={0} max={100} step={5} value={m.split.pct} onChange={(e) => setMove(m.id, { split: { to: m.split!.to, pct: Number(e.target.value) } })} aria-label="Share to the second destination, %" />
                            )}
                            {m.split && <span className="text-xs text-gray-500">%</span>}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <select className={inputCls} value={m.kind} onChange={(e) => setMove(m.id, { kind: e.target.value as Move['kind'], tilt: e.target.value === 'profit' ? false : m.tilt })} aria-label="Kind of move">
                              <option value="pct">% of it</option>
                              <option value="profit">its profit</option>
                            </select>
                            {m.kind === 'pct' && <input type="number" className={`${inputCls} w-20`} min={0} max={50} step={0.25} value={m.ratePct} onChange={(e) => setMove(m.id, { ratePct: Number(e.target.value) })} aria-label="Percent each time" />}
                          </div>
                        </td>
                        <td>
                          <input type="number" className={`${inputCls} w-20`} min={1} max={365} value={m.everyDays} onChange={(e) => setMove(m.id, { everyDays: Number(e.target.value) })} />
                        </td>
                        <td>
                          <input type="checkbox" checked={m.tilt} disabled={m.kind === 'profit'} onChange={(e) => setMove(m.id, { tilt: e.target.checked })} aria-label="Let market mood change this move" />
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
                <button type="button" className={btnCls} onClick={() => update((s) => ({ ...s, moves: [...s.moves, { id: `m${Date.now().toString(36)}`, kind: 'pct', from: 'cash', to: 'sov', split: null, ratePct: 2, everyDays: 30, tilt: true, on: true }] }))}>
                  + Add a move
                </button>
                <button type="button" className={btnCls} onClick={() => update((s) => ({ ...s, moves: DEFAULT_MOVES.map((m) => ({ ...m, split: m.split ? { ...m.split } : null })) }))}>
                  Back to the starting moves
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-gray-200">Targets</p>
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={settings.useTargets} onChange={(e) => update((s) => ({ ...s, useTargets: e.target.checked }))} /> Nudge moves toward a target mix
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {BUCKETS.map((b) => (
                    <label key={b} className="flex flex-col gap-1 text-xs text-gray-400">
                      {BUCKET_LABEL[b]} %
                      <input type="number" className={inputCls} min={0} max={100} value={settings.targets[b]} onChange={(e) => update((s) => ({ ...s, targets: { ...s.targets, [b]: Number(e.target.value) } }))} />
                    </label>
                  ))}
                </div>
                {ss && (
                  <button type="button" className={`${btnCls} self-start`} onClick={() => update((s) => ({ ...s, targets: { cash: Math.round(ss.cash * 100), lp: s.targets.lp, tokens: Math.round(ss.tokens * 100), sov: Math.round(ss.sov * 100) } }))}>
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
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Put into Liquidity at the start (CAD)
                  <input type="number" className={inputCls} min={0} step={0.01} value={settings.lpBasisCad} onChange={(e) => update((s) => ({ ...s, lpBasisCad: Number(e.target.value) }))} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-gray-400">
                  Store of Value sales come from
                  <select className={inputCls} value={settings.sovSell} onChange={(e) => update((s) => ({ ...s, sovSell: e.target.value as Settings['sovSell'] }))}>
                    <option value="spread">every coin, by size</option>
                    <option value="biggest">the biggest coin first</option>
                  </select>
                </label>
                <label className="col-span-2 flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={settings.sovLevel} onChange={(e) => update((s) => ({ ...s, sovLevel: e.target.checked }))} /> Level Store of Value: buys go to its smallest coin first
                </label>
                <label className="col-span-2 flex flex-col gap-1 text-xs text-gray-400">
                  Next Store of Value coins, once level (reminder)
                  <input className={inputCls} defaultValue={settings.sovNext} onBlur={(e) => update((s) => ({ ...s, sovNext: e.target.value }))} />
                </label>
                <label className="col-span-2 flex flex-col gap-1 text-xs text-gray-400">
                  Never sell (comma separated)
                  <input className={inputCls} defaultValue={settings.keep.join(', ')} onBlur={(e) => update((s) => ({ ...s, keep: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) }))} />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-gray-200">Where bought value goes</p>
              <p className="mb-2 text-xs text-gray-400">Shares per section, e.g. Tokens: HIVE 70, ETH 30. Leave a section empty to spread buys over what you already hold there (worth ${settings.minHoldingUsd}+). Liquidity always buys its own two coins; with levelling on, Store of Value buys go to the smallest coin listed (add XMR or PAXG here when it is time: it gets the buys until it catches up).</p>
              <div className="grid gap-3 md:grid-cols-3">
                {BUCKETS.filter((b) => b !== 'lp').map((b) => (
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
                Left alone with flat prices, the Cash LP → Tokens → Store of Value → Cash LP loop settles at <b className="text-gray-100">{pct(ss.cash, 0)} Cash LP / {pct(ss.tokens, 0)} Tokens / {pct(ss.sov, 0)} Store of Value</b>
                {half ? <>, closing half of any gap in about {half} months</> : null}. A fixed-% cycle always has such a resting mix: each section ends up in proportion to 1 ÷ the rate leaving it. Right
                now you are at {pct(w.cash, 0)} / {pct(w.tokens, 0)} / {pct(w.sov, 0)} (+ {pct(w.lp, 0)} Liquidity), so per month the plan moves about{' '}
                {BUCKETS.map((b) => `${monthlyFlows[b] >= 0 ? '+' : '−'}${usd0(Math.abs(monthlyFlows[b]))} ${BUCKET_LABEL[b]}`).join(', ')} (not counting the Liquidity profit sweep).
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
              Market mood changes a move by at most ±{Math.round(settings.tiltStrength * 100)}% here. In the backtest below they barely change the result either way: at a few % a month, <i>what</i> you hold matters far
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
              From {bt.from}. Store of Value priced as today&apos;s mix of {bt.mixes.sov.join(' + ') || 'BTC'}, Tokens as {bt.mixes.tokens.join(' + ') || 'HIVE'}, Liquidity as {bt.mixes.lp.join(' + ') || 'ETH + BNB'} held as-is (no fees earned, no impermanent loss: rough) (coins without free price history are left out),
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
