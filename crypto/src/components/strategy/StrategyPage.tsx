'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import FreshNote from '@/components/FreshNote';
import { useStoredThenLive } from '@/hooks/useStoredThenLive';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { BucketSnapshot, LpSnapshot, SovSnapshot } from '@/lib/types';
import type { StrategyMarket } from '@/app/api/strategy/market/route';
import type { StrategyStore } from '@/app/api/strategy/route';
import type { DailyRow } from '@/lib/portfolioDaily';
import { mergeHistory } from '@/lib/portfolioDaily';
import type { SummaryRow } from '@/lib/summary';
import { BUCKET_LABEL, BUCKET_LINK, BUCKETS, DEFAULT_SETTINGS, holdingsFrom, indicators, isoDay, riskScore, stanceOf, type AcbMap, type Bucket, type LogEntry } from '@/lib/strategy/model';
import {
  DEFAULT3,
  coinRows,
  makePlan,
  normalize3,
  normTargets3,
  review,
  schedule,
  taxLines,
  type Action,
  type Settings3,
} from '@/lib/strategy/bands';

/**
 * mes.fm/strategy (v3, 2026-11-27): the Friday routine. Fridays = look; first Friday of the month = make
 * the moves; first Friday of a quarter = review. Rules in lib/strategy/bands.ts.
 */

type TaxHolding = { asset: string; quantity: number; acbUsd: number; acbCad: number | null };
const LS3 = 'mes-strategy:v3';
const LS_LOG = 'mes-strategy:v1:log';
const COLOR: Record<Bucket, string> = { cash: '#22c55e', lp: '#3b82f6', tokens: '#a855f7', sov: '#f0b90b' };
const usd0 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cad0 = (v: number) => `${v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 })} CAD`;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const sgn = (v: number) => (v >= 0 ? '+' : '−');
const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n >= 100 ? 0 : n >= 1 ? 3 : 5 });
const day = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', opts);
const btn = 'rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent disabled:opacity-40';
const btnP = 'rounded-md border border-accent bg-accent/15 px-3 py-1.5 text-sm font-semibold text-accent hover:bg-accent/25 disabled:opacity-40';
const inp = 'w-20 rounded-md border border-bg-border bg-bg px-2 py-1 text-sm tabular-nums text-gray-100 focus:border-accent focus:outline-none';

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
    /* private browsing */
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
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ------------------------------------------------------------------ pieces */

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'gain' | 'loss' }) {
  return (
    <div className="rounded-lg border border-bg-border bg-bg/40 px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-gray-100'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function Chip({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'accent' | 'gain' | 'loss' }) {
  const cls = { muted: 'bg-bg-border/60 text-gray-300', accent: 'bg-accent/20 text-accent', gain: 'bg-gain/15 text-gain', loss: 'bg-loss/15 text-loss' }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

/** current weight on a track centred on the target, the band shaded */
function DriftTrack({ weight, target, band }: { weight: number; target: number; band: number }) {
  const span = Math.max(band * 2.6, Math.abs(weight - target) * 1.15, 0.05);
  const pos = (v: number) => `${Math.min(100, Math.max(0, 50 + ((v - target) / span) * 50))}%`;
  const out = Math.abs(weight - target) > band;
  return (
    <div className="relative h-3 w-full rounded bg-bg-border/50" aria-hidden="true">
      <div className="absolute top-0 h-3 rounded bg-gain/20" style={{ left: pos(target - band), right: `calc(100% - ${pos(target + band)})` }} />
      <div className="absolute top-[-3px] h-[18px] w-px bg-gray-400" style={{ left: pos(target) }} />
      <div className={`absolute top-[-2px] h-4 w-4 -translate-x-1/2 rounded-full border-2 border-bg-panel ${out ? 'bg-loss' : 'bg-gain'}`} style={{ left: pos(weight) }} />
    </div>
  );
}

function MixBar({ w, label }: { w: Record<Bucket, number>; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs text-gray-400">{label}</span>
      <div className="flex h-4 flex-1 overflow-hidden rounded">
        {BUCKETS.map((b) =>
          w[b] > 0.001 ? (
            <div key={b} title={`${BUCKET_LABEL[b]} ${pct(w[b])}`} className="flex items-center justify-center text-[10px] font-semibold text-black/80" style={{ width: `${w[b] * 100}%`, background: COLOR[b] }}>
              {w[b] > 0.08 ? pct(w[b], 0) : ''}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ one action */

function ActionRow({ n, a, done, tax, onDone, onSkip }: { n: number; a: Action; done: LogEntry | null; tax?: { key: string; gainCad: number; superficial: boolean }[]; onDone: (usd: number) => void; onSkip: () => void }) {
  const [amt, setAmt] = useState(String(a.usd));
  useEffect(() => setAmt(String(a.usd)), [a.usd]);
  const legs = (ls: Action['sells']) => ls.map((l) => (l.amount != null ? `${qty(l.amount)} ${l.key}` : l.key)).join(' · ');
  const kindLabel = a.kind === 'harvest' ? 'Profit' : a.kind === 'trim' ? 'Trim' : 'Rebalance';
  return (
    <li className={`flex flex-col gap-2 rounded-lg border p-3 ${done ? 'border-bg-border opacity-60' : 'border-accent/50 bg-accent/5'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">{done ? '✓' : n}</span>
        <span className="font-semibold text-gray-100">
          <a href={BUCKET_LINK[a.from]} className="hover:text-accent">{BUCKET_LABEL[a.from]}</a>
          <span className="px-1.5 text-gray-500">→</span>
          <a href={BUCKET_LINK[a.to]} className="hover:text-accent">{BUCKET_LABEL[a.to]}</a>
        </span>
        <span className="text-lg font-semibold tabular-nums text-gray-100">{usd0(a.usd)}</span>
        <Chip>{kindLabel}</Chip>
        <span className="text-xs text-gray-500">{a.why}</span>
      </div>
      <div className="grid gap-1 text-sm sm:grid-cols-2">
        <p><span className="text-loss">Sell</span> <span className="text-gray-200">{legs(a.sells) || '—'}</span></p>
        <p><span className="text-gain">Buy</span> <span className="text-gray-200">{legs(a.buys) || '—'}</span></p>
      </div>
      {tax && tax.length > 0 && (
        <p className="text-xs text-gray-400">
          Tax:{' '}
          {tax.map((t, i) => (
            <span key={t.key} className={t.superficial ? 'text-loss' : ''}>
              {i > 0 && ' · '}
              {t.key} {t.gainCad >= 0 ? 'gain' : 'loss'} {cad0(Math.abs(t.gainCad))}
              {t.superficial && ' (superficial: this plan buys it back)'}
            </span>
          ))}
        </p>
      )}
      {done ? (
        <p className="text-xs text-gray-400">{done.skipped ? 'Skipped' : `Done ${usd0(done.usd)}`} on {day(done.date)}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-gray-400">
            $ <input className={inp} inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Amount moved" />
          </label>
          <button type="button" className={btnP} onClick={() => onDone(Number(amt) || a.usd)}>Done</button>
          <button type="button" className={btn} onClick={onSkip}>Skip</button>
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ page */

export default function StrategyPage() {
  const cash = useStoredThenLive<BucketSnapshot>('/api/cash');
  const tokens = useStoredThenLive<BucketSnapshot>('/api/tokens');
  const sov = useStoredThenLive<SovSnapshot>('/api/sov');
  const lpq = useStoredThenLive<LpSnapshot>('/api/lp');
  const market = useSWR(`${BASE_PATH}/api/strategy/market`, (u: string) => fetchApiResult<StrategyMarket>(u), { revalidateOnFocus: false });
  const taxes = useSWR(`${BASE_PATH}/api/taxes?stored=1`, (u: string) => fetchApiResult<{ holdings?: TaxHolding[]; data?: { holdings?: TaxHolding[] } } | null>(u), { revalidateOnFocus: false, shouldRetryOnError: false });
  const store = useSWR(`${BASE_PATH}/api/strategy`, (u: string) => fetchApiResult<StrategyStore | null>(u), { revalidateOnFocus: false });
  const daily = useSWR(`${BASE_PATH}/api/portfolio/daily`, (u: string) => fetchApiResult<{ rows: DailyRow[] } | null>(u), { revalidateOnFocus: false });
  const summary = useSWR(`${BASE_PATH}/api/summary`, (u: string) => fetchApiResult<{ rows: SummaryRow[] } | null>(u), { revalidateOnFocus: false });

  const [s, setS] = useState<Settings3>(DEFAULT3);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<'' | 'saving' | 'saved' | 'local'>('');
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setNow(new Date()), []);

  useEffect(() => {
    if (loaded || (store.data === undefined && !store.error)) return;
    const srv = store.data ?? null;
    setS(normalize3(srv?.settings3 ?? readLS<Settings3>(LS3) ?? srv?.settings ?? readLS('mes-strategy:v1') ?? DEFAULT3));
    setLog(srv ? srv.log : (readLS<LogEntry[]>(LS_LOG) ?? []));
    setLoaded(true);
  }, [store.data, store.error, loaded]);

  const update = useCallback((patch: Partial<Settings3> | ((o: Settings3) => Settings3)) => {
    setS((o) => {
      const next = normalize3(typeof patch === 'function' ? patch(o) : { ...o, ...patch });
      writeLS(LS3, next);
      clearTimeout(timer.current);
      setSaveState('saving');
      timer.current = setTimeout(async () => setSaveState((await post({ settings3: next })).ok ? 'saved' : 'local'), 800);
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

  const inds = useMemo(() => (market.data ? indicators(market.data.inputs) : []), [market.data]);
  const risk = useMemo(() => riskScore(inds, DEFAULT_SETTINGS.weights), [inds]);
  const stance = stanceOf(risk.score);
  const plan = useMemo(() => (holdings ? makePlan(holdings, s, risk.score, log, lpq.data?.totalUsd ?? null) : null), [holdings, s, risk.score, log, lpq.data]);
  const coins = useMemo(() => (holdings ? coinRows(holdings, s).slice(0, 8) : []), [holdings, s]);
  const acb = useMemo<AcbMap | null>(() => {
    const hs = taxes.data?.holdings ?? taxes.data?.data?.holdings;
    return hs ? Object.fromEntries(hs.map((x) => [x.asset.toUpperCase(), { qty: x.quantity, acbUsd: x.acbUsd, acbCad: x.acbCad }])) : null;
  }, [taxes.data]);
  const cadRate = cash.data?.cadRate ?? sov.data?.cadRate ?? null;
  const tax = useMemo(() => (plan ? taxLines(plan.actions, acb, cadRate) : {}), [plan, acb, cadRate]);

  const sch = now ? schedule(now) : null;
  const thisMonthLog = sch ? log.filter((e) => e.date >= sch.thisMoveDay) : [];
  const doneFor = (a: Action) => thisMonthLog.find((e) => e.moveId === a.kind && e.from === a.from && e.to === a.to) ?? null;
  const open = plan ? plan.actions.filter((a) => !doneFor(a)) : [];
  const moveDayPassed = sch ? sch.today >= sch.thisMoveDay : false;
  const isMoveDay = sch?.kind === 'month' || sch?.kind === 'quarter';
  // a missed move day is flagged for its own week only; after that the plan waits for the next one
  const weekAfter = sch ? isoDay(new Date(`${sch.thisMoveDay}T12:00:00`).getTime() + 6 * 86_400_000) : '';
  const overdue = !!sch && moveDayPassed && sch.today <= weekAfter && !isMoveDay && open.length > 0 && thisMonthLog.length === 0;
  const actNow = isMoveDay || overdue;
  const outRows = plan?.rows.filter((r) => r.status !== 'ok') ?? [];
  const urgent = outRows.filter((r) => r.urgent);

  // quarter review: daily rows + /summary checks, section growth from coin prices
  const hist = useMemo(() => mergeHistory(daily.data?.rows ?? [], summary.data?.rows ?? [], null), [daily.data, summary.data]);
  const rev = useMemo(() => {
    if (!sch || !holdings) return null;
    const startDay = sch.kind === 'quarter' ? schedule(new Date(new Date(`${sch.quarterStart}T12:00:00`).getTime() - 86_400_000)).quarterStart : sch.quarterStart;
    let growth: Record<Bucket, number | null> | null = null;
    const m = market.data;
    if (m && m.days.length) {
      const at = (sym: string, d: string) => {
        const arr = m.prices[sym];
        if (!arr) return null;
        for (let i = m.days.length - 1; i >= 0; i--) if (m.days[i]! <= d && arr[i] != null) return arr[i]!;
        return null;
      };
      const ALIAS: Record<string, string> = { 'SWAP.HIVE': 'HIVE', BTCB: 'BTC', WBTC: 'BTC', 'SWAP.BTC': 'BTC', WETH: 'ETH', WBNB: 'BNB', LEO: 'LEO' };
      const g = (items: { key: string; valueUsd: number }[], d0: string, d1: string) => {
        let w = 0;
        let x = 0;
        for (const it of items) {
          const k = ALIAS[it.key.toUpperCase()] ?? it.key.toUpperCase();
          const a = at(k, d0);
          const b = at(k, d1);
          if (a && b) {
            w += it.valueUsd;
            x += it.valueUsd * (b / a);
          }
        }
        return w > 0 ? x / w : null;
      };
      const last = hist[hist.length - 1]?.d ?? sch.today;
      const lpLegs = (lpq.data?.positions ?? []).flatMap((p) => p.legs.map((l) => ({ key: l.symbol, valueUsd: l.valueUsd ?? 0 })));
      growth = { cash: 1, lp: lpLegs.length ? g(lpLegs, startDay, last) : null, tokens: g(holdings.items.filter((i) => i.bucket === 'tokens'), startDay, last), sov: g(holdings.items.filter((i) => i.bucket === 'sov'), startDay, last) };
    }
    return review(hist, startDay, log, s.targets, growth);
  }, [sch, holdings, market.data, hist, log, s.targets, lpq.data]);

  const copyPlan = async () => {
    if (!plan) return;
    const lines = plan.actions.map((a, i) => `${i + 1}. ${BUCKET_LABEL[a.from]} → ${BUCKET_LABEL[a.to]} ${usd0(a.usd)}: sell ${a.sells.map((l) => (l.amount != null ? `${qty(l.amount)} ${l.key}` : l.key)).join(', ')}; buy ${a.buys.map((l) => (l.amount != null ? `${qty(l.amount)} ${l.key}` : l.key)).join(', ')}`);
    try {
      await navigator.clipboard.writeText(`MES Strategy, ${sch?.today}\n${lines.join('\n') || 'No moves.'}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const logAction = (a: Action, usd: number, skipped = false) =>
    addLog({ id: newId(), moveId: a.kind, date: isoDay(Date.now()), usd: skipped ? 0 : usd, from: a.from, to: a.to, cad: cadRate ?? undefined, note: `${a.sells.map((l) => l.key).join('+')} → ${a.buys.map((l) => l.key).join('+')}`, skipped: skipped || undefined });

  const dayTitle = !sch ? '' : sch.kind === 'quarter' ? 'Quarter review + move day' : sch.kind === 'month' ? 'Move day' : sch.kind === 'week' ? 'Friday check' : overdue ? 'Move day not done yet' : 'Between checks';
  const headline = !plan
    ? 'Loading your sections…'
    : actNow
      ? open.length
        ? `${open.length} move${open.length === 1 ? '' : 's'} to make`
        : plan.actions.length
          ? 'All of this month\'s moves are done'
          : 'Every section is inside its band. No moves this month.'
      : urgent.length
        ? `${urgent.map((r) => BUCKET_LABEL[r.bucket]).join(' and ')} far off target: OK to move now`
        : outRows.length
          ? `${outRows.length} section${outRows.length === 1 ? '' : 's'} outside the band → fix on move day`
          : 'Inside every band. Nothing to do.';
  const all = holdings?.all ?? 0;
  const tNow = holdings ? (Object.fromEntries(BUCKETS.map((b) => [b, holdings.total[b] / (holdings.all || 1)])) as Record<Bucket, number>) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* today */}
      <div className={`panel flex flex-col gap-3 ${actNow && open.length ? 'border-accent/70' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="stat-label">{sch ? `${day(sch.today, { weekday: 'long', month: 'long', day: 'numeric' })} · ${dayTitle}` : ' '}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-100">{headline}</p>
          </div>
          {saveState && <span className="text-xs text-gray-500">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Saved in this browser only'}</span>}
        </div>
        {sch && (
          <div className="flex flex-wrap gap-2">
            <Chip tone={sch.kind === 'week' ? 'accent' : 'muted'}>👀 Check · {sch.kind === 'none' ? day(sch.nextFriday) : 'today'}</Chip>
            <Chip tone={isMoveDay || overdue ? 'accent' : 'muted'}>⇄ Moves · {isMoveDay ? 'today' : overdue ? `due since ${day(sch.thisMoveDay)}` : `${day(sch.nextMoveDay)} (${sch.daysToMove} d)`}</Chip>
            <Chip tone={sch.kind === 'quarter' ? 'accent' : 'muted'}>📊 Review · {sch.kind === 'quarter' ? 'today' : day(sch.nextQuarter)}</Chip>
          </div>
        )}
        <FreshNote savedAt={sov.savedAt ?? cash.savedAt} updating={sov.updating || cash.updating} error={sov.error ?? cash.error} />
      </div>

      {/* mix */}
      {plan && tNow && (
        <div className="panel flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="stat-label">Your mix · {usd0(all)}</p>
            <p className="text-xs text-gray-500">Green zone = band. Outside it, the section goes back to target on move day.</p>
          </div>
          <MixBar w={tNow} label="Now" />
          <MixBar w={Object.fromEntries(plan.rows.map((r) => [r.bucket, r.target])) as Record<Bucket, number>} label="Target" />
          <ul className="mt-1 flex flex-col gap-3">
            {plan.rows.map((r) => (
              <li key={r.bucket} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-1 sm:grid-cols-[10rem_minmax(0,1fr)_17rem]">
                <a href={BUCKET_LINK[r.bucket]} className="flex items-center gap-2 font-semibold text-gray-100 hover:text-accent">
                  <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLOR[r.bucket] }} />
                  {BUCKET_LABEL[r.bucket]}
                </a>
                <DriftTrack weight={r.weight} target={r.target} band={r.band} />
                <p className="col-span-2 flex items-center justify-end gap-2 whitespace-nowrap text-sm tabular-nums sm:col-span-1">
                  <span className="text-gray-100">{pct(r.weight)}</span>
                  <span className="text-gray-500">/ {pct(r.target, 0)} ±{(r.band * 100).toFixed(0)}</span>
                  <span className="text-gray-400">{usd0(r.value)}</span>
                  <Chip tone={r.status === 'ok' ? 'gain' : 'loss'}>{r.status === 'ok' ? 'OK' : r.status === 'over' ? 'Over' : 'Under'}</Chip>
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* moves */}
      {plan && (
        <div className="panel flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="stat-label">{actNow ? 'Moves for today' : `Preview · moves for ${sch ? day(sch.nextMoveDay) : 'move day'}`}</p>
            <button type="button" className={btn} onClick={copyPlan} disabled={!plan.actions.length}>{copied ? 'Copied' : 'Copy plan'}</button>
          </div>
          {plan.actions.length === 0 ? (
            <p className="text-sm text-gray-400">No moves: every section is inside its band, no coin is over its cap{s.harvest ? ', and the Liquidity profit is under the minimum' : ''}.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {plan.actions.map((a, i) => (
                <ActionRow key={a.id} n={i + 1} a={a} done={doneFor(a)} tax={tax[a.id]} onDone={(u) => logAction(a, u)} onSkip={() => logAction(a, 0, true)} />
              ))}
            </ol>
          )}
          <p className="text-xs text-gray-500">
            Moves under {usd0(s.minTradeUsd)} are left out{plan.skippedSmall ? ` (${plan.skippedSmall} this time)` : ''}. Liquidity: put in {usd0(plan.lp.basis)}
            {plan.lp.profit != null && <>, {plan.lp.profit >= 0 ? 'profit' : 'down'} {usd0(Math.abs(plan.lp.profit))}</>}.
          </p>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* coins */}
        {coins.length > 0 && (
          <div className="panel flex flex-col gap-2">
            <p className="stat-label">Biggest coins · share of everything</p>
            <ul className="flex flex-col gap-2">
              {coins.map((c) => (
                <li key={c.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)_7.5rem] items-center gap-2 text-sm">
                  <span className="font-semibold text-gray-100">{c.key}</span>
                  <div className="relative h-2.5 rounded bg-bg-border/50">
                    <div className="absolute left-0 top-0 h-2.5 rounded" style={{ width: `${Math.min(100, c.share * 100)}%`, background: c.over ? 'rgb(var(--c-loss))' : COLOR[c.bucket] }} />
                    <div className="absolute top-[-3px] h-4 w-0.5 bg-gray-300" style={{ left: `${Math.min(100, c.cap * 100)}%` }} title={`Cap ${pct(c.cap, 0)}`} />
                  </div>
                  <span className="text-right tabular-nums">
                    <span className={c.over ? 'font-semibold text-loss' : 'text-gray-100'}>{pct(c.share)}</span> <span className="text-xs text-gray-500">cap {pct(c.cap, 0)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500">
              Over its cap = no new buys, trimmed on move day once 3 points over. Your conviction caps: {Object.entries(s.caps).map(([k, v]) => `${k} ${v}%`).join(', ') || 'none'}; others {s.capDefault}%.
            </p>
          </div>
        )}

        {/* market */}
        <div className="panel flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="stat-label">Market mood</p>
            {inds.length > 0 && <Chip tone={stance.tone === 'buy' ? 'gain' : stance.tone === 'sell' ? 'loss' : 'muted'}>{stance.label}</Chip>}
          </div>
          {!market.data ? (
            <p className="text-sm text-gray-400">{market.error ? 'Market data did not load.' : 'Loading…'}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {inds.filter((i) => i.key !== 'alt').map((i) => (
                  <span key={i.key} title={i.plain} className={`rounded-md border px-2 py-1 text-xs ${i.score > 0.2 ? 'border-gain/40 text-gain' : i.score < -0.2 ? 'border-loss/40 text-loss' : 'border-bg-border text-gray-300'}`}>
                    {i.name}: <strong>{i.value}</strong>
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-300">
                {s.tilt && plan && Math.abs(plan.shift) >= 0.001
                  ? `Targets nudged ${(Math.abs(plan.shift) * 100).toFixed(1)} pts from ${plan.shift > 0 ? 'Cash LP to Tokens' : 'Tokens to Cash LP'}.`
                  : s.tilt
                    ? 'Mood is neutral: targets unchanged.'
                    : 'Mood nudge is off.'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* quarter */}
      <details className="panel" open={sch?.kind === 'quarter'}>
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
          <span className="stat-label">{sch?.kind === 'quarter' ? 'Last quarter' : 'This quarter so far'}{rev ? ` · since ${day(rev.from.d)}` : ''}</span>
          {rev && <span className={`text-sm font-semibold tabular-nums ${rev.change >= 0 ? 'text-gain' : 'text-loss'}`}>{sgn(rev.change)}{usd0(Math.abs(rev.change))} ({sgn(rev.changePct)}{pct(Math.abs(rev.changePct))})</span>}
        </summary>
        {!rev ? (
          <p className="mt-3 text-sm text-gray-400">Not enough history yet: /portfolio saves a point each day it is opened.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Stat label="Start" value={usd0(rev.startTotal)} sub={day(rev.from.d)} />
              <Stat label="Now" value={usd0(rev.endTotal)} sub={day(rev.to.d)} />
              <Stat label="Change" value={`${sgn(rev.change)}${usd0(Math.abs(rev.change))}`} tone={rev.change >= 0 ? 'gain' : 'loss'} />
              <Stat
                label="vs just holding"
                value={rev.holdTotal != null ? `${sgn(rev.endTotal - rev.holdTotal)}${usd0(Math.abs(rev.endTotal - rev.holdTotal))}` : '—'}
                sub={rev.holdTotal != null ? `holding: ${usd0(rev.holdTotal)}` : 'no prices'}
                tone={rev.holdTotal == null ? undefined : rev.endTotal >= rev.holdTotal ? 'gain' : 'loss'}
              />
              <Stat label="Moves" value={String(rev.moves)} sub={usd0(rev.movedUsd)} />
            </div>
            <p className="text-xs text-gray-500">Deposits and withdrawals count as gains / losses here. &ldquo;Just holding&rdquo; = the start mix with each section&apos;s coins at today&apos;s prices. Biggest drift this quarter: {rev.maxOffPts.toFixed(1)} pts.</p>
            {sch?.kind === 'quarter' && (
              <ul className="flex flex-col gap-1 text-sm text-gray-200">
                <li>☐ Targets still right? Most drift was {rev.maxOffPts.toFixed(0)} pts.</li>
                <li>☐ Conviction caps still right? (HIVE, XRP)</li>
                <li>☐ Bands too tight (many moves) or too loose (none)?</li>
              </ul>
            )}
          </div>
        )}
      </details>

      {/* log */}
      {log.length > 0 && (
        <details className="panel">
          <summary className="stat-label cursor-pointer">Moves done · {log.filter((e) => !e.skipped).length}</summary>
          <ul className="mt-3 flex flex-col text-sm">
            {log.slice(0, 30).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-b border-bg-border/60 py-1.5">
                <span className="min-w-0 truncate text-gray-300">
                  <span className="tabular-nums text-gray-500">{e.date}</span> {BUCKET_LABEL[e.from]} → {BUCKET_LABEL[e.to]} {e.note && <span className="text-gray-500">· {e.note}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                  {e.skipped ? <span className="text-gray-500">skipped</span> : usd0(e.usd)}
                  <button type="button" className="text-gray-500 hover:text-loss" onClick={() => removeLog(e.id)} aria-label="Remove">×</button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* settings */}
      <details className="panel">
        <summary className="stat-label cursor-pointer">Settings</summary>
        <div className="mt-3 grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-200">Targets % <span className="font-normal text-gray-500">(sum {BUCKETS.reduce((x, b) => x + s.targets[b], 0)})</span></p>
            {BUCKETS.map((b) => (
              <label key={b} className="flex items-center justify-between gap-2 text-sm text-gray-300">
                {BUCKET_LABEL[b]}
                <input className={inp} type="number" min={0} max={100} value={s.targets[b]} onChange={(e) => update((o) => ({ ...o, targets: { ...o.targets, [b]: Number(e.target.value) } }))} />
              </label>
            ))}
            <p className="text-xs text-gray-500">Rescaled to 100: {BUCKETS.map((b) => `${BUCKET_LABEL[b]} ${pct(normTargets3(s.targets)[b], 0)}`).join(' · ')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-200">Bands and moves</p>
            {(
              [
                ['bandAbs', 'Band: points from target', 1],
                ['bandRel', 'or % of the target (bigger wins)', 5],
                ['urgentAbs', 'Act before move day at points off', 1],
                ['minTradeUsd', 'Smallest move $', 10],
                ['minHoldingUsd', 'Smallest coin to buy / sell $', 50],
                ['tiltPts', 'Market mood nudge, max points', 1],
                ['lpBasisUsd', 'Liquidity: first amount put in $', 1],
              ] as [keyof Settings3, string, number][]
            ).map(([k, l, step]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-sm text-gray-300">
                {l}
                <input className={inp} type="number" step={step} value={s[k] as number} onChange={(e) => update({ [k]: Number(e.target.value) } as Partial<Settings3>)} />
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={s.tilt} onChange={(e) => update({ tilt: e.target.checked })} /> Market mood nudges Cash LP ↔ Tokens
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={s.harvest} onChange={(e) => update({ harvest: e.target.checked })} /> Liquidity profit → Store of Value on move day
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-200">Coin caps (% of everything)</p>
            <TextMap value={s.caps} onChange={(caps) => update({ caps })} placeholder="XRP 45, HIVE 30" />
            <label className="flex items-center justify-between gap-2 text-sm text-gray-300">
              Every other coin
              <input className={inp} type="number" value={s.capDefault} onChange={(e) => update({ capDefault: Number(e.target.value) })} />
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-200">Where new money goes inside a section</p>
            {(['sov', 'tokens', 'cash'] as Bucket[]).map((b) => (
              <label key={b} className="flex flex-col gap-1 text-sm text-gray-300">
                {BUCKET_LABEL[b]} <span className="text-xs text-gray-500">{b === 'sov' ? 'empty = keep the coins level' : 'empty = as you hold it now'}</span>
                <TextMap value={s.mix[b]} onChange={(m) => update((o) => ({ ...o, mix: { ...o.mix, [b]: m } }))} placeholder={b === 'sov' ? 'BTC 70, XRP 30' : b === 'cash' ? 'HBD 100' : 'HIVE 60, ETH 40'} />
              </label>
            ))}
            <label className="flex flex-col gap-1 text-sm text-gray-300">
              Never sell
              <input className="rounded-md border border-bg-border bg-bg px-2 py-1 text-sm text-gray-100" defaultValue={s.keep.join(', ')} onBlur={(e) => update({ keep: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
            </label>
          </div>
        </div>
        <button type="button" className={`${btn} mt-4`} onClick={() => update(DEFAULT3)}>Reset to defaults</button>
      </details>
    </div>
  );
}

/** "XRP 45, HIVE 30" <-> { XRP: 45, HIVE: 30 } */
function TextMap({ value, onChange, placeholder }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void; placeholder: string }) {
  const str = Object.entries(value).map(([k, v]) => `${k} ${v}`).join(', ');
  const [t, setT] = useState(str);
  useEffect(() => setT(str), [str]);
  const commit = () => {
    const o: Record<string, number> = {};
    for (const part of t.split(',')) {
      const m = part.trim().match(/^([A-Za-z0-9./]+)\s*[:=]?\s*([\d.]+)%?$/);
      if (m) o[m[1]!.toUpperCase()] = Number(m[2]);
    }
    onChange(o);
  };
  return <input className="rounded-md border border-bg-border bg-bg px-2 py-1 text-sm text-gray-100" value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />;
}
