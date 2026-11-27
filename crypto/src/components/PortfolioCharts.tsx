'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAssetsTotal } from '@/hooks/useAssetsTotal';
import { useStoredThenLive } from '@/hooks/useStoredThenLive';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import { SECS, SEC_COLOR, SEC_LABEL, mergeHistory, utcToday, type DailyRow, type HistPoint, type Sec, type Slice } from '@/lib/portfolioDaily';
import type { BucketSnapshot, CombinedPortfolio, LpSnapshot, SovSnapshot } from '@/lib/types';
import type { SummaryRow } from '@/lib/summary';

/**
 * The overview's two charts, built only from numbers the page already loads (the section cards' own
 * requests, shared through SWR) - no extra price or chain calls. (1) What you hold now: pie or columns.
 * (2) Value over time: one line / stacked band / share per section, from /api/portfolio/daily (a row a
 * day, written here once the live numbers are in) plus mes.fm/summary's checks for older dates.
 * Clicking a section chip hides / shows it in both charts; double-click = only that one.
 */

type Kind = 'pie' | 'bar';
type Mode = 'lines' | 'stack' | 'share';
type Range = '1m' | '3m' | '1y' | 'all';
interface Prefs {
  kind: Kind;
  mode: Mode;
  range: Range;
  labels: boolean;
  total: boolean;
  hidden: Slice[];
}
const LS = 'mes-portfolio:charts';
const LS_SENT = 'mes-portfolio:daily-sent';
const DEF: Prefs = { kind: 'pie', mode: 'stack', range: 'all', labels: true, total: true, hidden: ['other'] };
const SLICES: Slice[] = [...SECS, 'other'];

const usd0 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const short = (v: number) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(v >= 1e4 ? 0 : 1)}k` : `$${Math.round(v)}`);
const pctF = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
const segCls = (on: boolean) => `px-2.5 py-1 text-sm ${on ? 'bg-accent/20 font-semibold text-accent' : 'text-gray-300 hover:text-accent'}`;
const tipBox = 'rounded-lg border border-bg-border bg-bg-panel px-3 py-2 text-sm tabular-nums shadow-lg';
const axisTick = { fill: 'rgb(var(--g-400))', fontSize: 12 };

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

function Chips({ slices, hidden, onToggle, onOnly, onAll, values }: {
  slices: Slice[];
  hidden: Set<Slice>;
  onToggle: (s: Slice) => void;
  onOnly: (s: Slice) => void;
  onAll: () => void;
  values?: Partial<Record<Slice, number>>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {slices.map((s) => {
        const off = hidden.has(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={!off}
            title={off ? 'Click to show · double-click for only this one' : 'Click to hide · double-click for only this one'}
            onClick={() => onToggle(s)}
            onDoubleClick={() => onOnly(s)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              off ? 'border-bg-border text-gray-500 line-through' : 'border-bg-border text-gray-200 hover:border-accent'
            }`}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: off ? 'transparent' : SEC_COLOR[s], border: `1.5px solid ${SEC_COLOR[s]}` }} />
            {SEC_LABEL[s]}
            {values && values[s] != null && <span className="tabular-nums text-gray-400">{short(values[s]!)}</span>}
          </button>
        );
      })}
      {hidden.size > 0 && (
        <button type="button" onClick={onAll} className="px-1.5 text-xs text-accent hover:underline">
          Show all
        </button>
      )}
    </div>
  );
}

export default function PortfolioCharts() {
  const pf = useStoredThenLive<CombinedPortfolio>('/api/portfolio');
  const sov = useStoredThenLive<SovSnapshot>('/api/sov');
  const lp = useStoredThenLive<LpSnapshot>('/api/lp');
  const cash = useStoredThenLive<BucketSnapshot>('/api/cash');
  const tokens = useStoredThenLive<BucketSnapshot>('/api/tokens');
  const { assets } = useAssetsTotal();
  const daily = useSWR(`${BASE_PATH}/api/portfolio/daily`, (u: string) => fetchApiResult<{ rows: DailyRow[] } | null>(u), { revalidateOnFocus: false });
  const summary = useSWR(`${BASE_PATH}/api/summary`, (u: string) => fetchApiResult<{ rows: SummaryRow[] } | null>(u), { revalidateOnFocus: false });

  const [p, setP] = useState<Prefs>(DEF);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(LS) || 'null') as Partial<Prefs> | null;
      if (v) setP((o) => ({ ...o, ...v }));
    } catch {
      /* ignore */
    }
  }, []);
  const set = (x: Partial<Prefs>) =>
    setP((o) => {
      const n = { ...o, ...x };
      try {
        localStorage.setItem(LS, JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  const hidden = useMemo(() => new Set(p.hidden), [p.hidden]);
  const toggle = (s: Slice) => set({ hidden: hidden.has(s) ? p.hidden.filter((x) => x !== s) : [...p.hidden, s] });
  const only = (s: Slice) => set({ hidden: SLICES.filter((x) => x !== s) });
  const all = () => set({ hidden: [] });

  // today's numbers (null until every section has answered)
  const now: Record<Slice, number> | null = useMemo(() => {
    if (!pf.data || !sov.data || !lp.data || !cash.data || !tokens.data) return null;
    const w = (k: string) => pf.data!.wallets.find((x) => x.key === k)?.totalValueUsd ?? 0;
    const v = { ai: w('ai'), mfa: w('mfa'), sov: sov.data.totalUsd, lp: lp.data.totalUsd, cash: cash.data.totalUsd, tokens: tokens.data.totalUsd, other: 0 };
    const parts = SECS.reduce((s, k) => s + v[k], 0);
    v.other = assets ? Math.max(0, assets.totalAllUsd - parts) : 0;
    return v;
  }, [pf.data, sov.data, lp.data, cash.data, tokens.data, assets]);
  const allLive = !pf.stale && !sov.stale && !lp.stale && !cash.stale && !tokens.stale && !pf.updating && !sov.updating && !lp.updating && !cash.updating && !tokens.updating;

  const liveRow: DailyRow | null = useMemo(
    () => (now ? { d: utcToday(), sov: now.sov, tokens: now.tokens, lp: now.lp, cash: now.cash, ai: now.ai, mfa: now.mfa, all: assets?.totalAllUsd ?? null } : null),
    [now, assets],
  );

  // save today's row once the live numbers are in (at most once an hour per browser; the server keeps the latest for the day)
  const sent = useRef(false);
  useEffect(() => {
    if (!liveRow || !allLive || sent.current || daily.data === null) return;
    sent.current = true;
    let last = 0;
    try {
      last = Number(localStorage.getItem(LS_SENT) || 0);
    } catch {
      /* ignore */
    }
    if (Date.now() - last < 3600_000) return;
    fetch(`${BASE_PATH}/api/portfolio/daily`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ add: liveRow }) })
      .then((r) => {
        if (r.ok) {
          try {
            localStorage.setItem(LS_SENT, String(Date.now()));
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {});
  }, [liveRow, allLive, daily.data]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Allocation now={now} p={p} set={set} hidden={hidden} toggle={toggle} only={only} all={all} />
      <History
        points={mergeHistory(daily.data?.rows ?? [], summary.data?.rows ?? [], liveRow)}
        loading={daily.isLoading || summary.isLoading}
        p={p}
        set={set}
        hidden={hidden}
        toggle={toggle}
        only={only}
        all={all}
      />
    </div>
  );
}

interface Shared {
  p: Prefs;
  set: (x: Partial<Prefs>) => void;
  hidden: Set<Slice>;
  toggle: (s: Slice) => void;
  only: (s: Slice) => void;
  all: () => void;
}

function Allocation({ now, p, set, hidden, toggle, only, all }: Shared & { now: Record<Slice, number> | null }) {
  const slices = SLICES.filter((s) => (now ? now[s] >= 1 : s !== 'other'));
  const data = now ? slices.filter((s) => !hidden.has(s)).map((s) => ({ key: s, name: SEC_LABEL[s], value: now[s] })) : [];
  const sum = data.reduce((t, d) => t + d.value, 0) || 1;
  const rows = [...data].sort((a, b) => b.value - a.value);

  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="stat-label">What you hold now</p>
        <Seg label="Chart type" value={p.kind} onChange={(kind) => set({ kind })} options={[['pie', 'Pie'], ['bar', 'Columns']]} />
      </div>
      {!now ? (
        <p className="py-16 text-center text-sm text-gray-400">Loading the sections…</p>
      ) : (
        <>
          <p className="text-sm text-gray-400">
            <span className="text-lg font-semibold text-gray-100">{usd0(sum)}</span> in the {data.length === slices.length ? 'sections' : `${data.length} picked section${data.length === 1 ? '' : 's'}`}
          </p>
          <div className="h-64 w-full">
            {data.length === 0 ? (
              <p className="py-16 text-center text-sm text-gray-400">Every section is hidden. Click one below.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {p.kind === 'pie' ? (
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="48%"
                      outerRadius="80%"
                      paddingAngle={data.length > 1 ? 1.5 : 0}
                      stroke="rgb(var(--c-panel))"
                      isAnimationActive={false}
                      onClick={(d: { key?: Slice }) => d?.key && toggle(d.key)}
                      label={
                        p.labels
                          ? ({ percent, x, y, textAnchor }: { percent: number; x: number; y: number; textAnchor: 'start' | 'end' | 'middle' }) =>
                              percent >= 0.03 ? (
                                <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="central" fill="rgb(var(--g-200))" fontSize={12}>
                                  {pctF(percent)}
                                </text>
                              ) : null
                          : false
                      }
                      labelLine={false}
                    >
                      {data.map((d) => (
                        <Cell key={d.key} fill={SEC_COLOR[d.key]} cursor="pointer" />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) =>
                        active && payload?.[0] ? (
                          <div className={tipBox}>
                            <p className="text-gray-100">{payload[0].name}</p>
                            <p className="text-gray-300">
                              {usd0(Number(payload[0].value))} · {pctF(Number(payload[0].value) / sum)}
                            </p>
                            <p className="text-xs text-gray-500">Click to hide</p>
                          </div>
                        ) : null
                      }
                    />
                  </PieChart>
                ) : (
                  <BarChart data={rows} margin={{ left: 0, right: 8, top: 22, bottom: 0 }}>
                    <CartesianGrid stroke="rgb(var(--c-border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" tick={{ ...axisTick, fontSize: 11 }} interval={0} tickFormatter={(n: string) => n.split(' ')[0] ?? n} />
                    <YAxis tick={axisTick} width={52} tickFormatter={short} />
                    <Tooltip
                      cursor={{ fill: 'rgb(var(--c-border))', opacity: 0.4 }}
                      content={({ active, payload }) =>
                        active && payload?.[0] ? (
                          <div className={tipBox}>
                            <p className="text-gray-100">{(payload[0].payload as { name: string }).name}</p>
                            <p className="text-gray-300">
                              {usd0(Number(payload[0].value))} · {pctF(Number(payload[0].value) / sum)}
                            </p>
                            <p className="text-xs text-gray-500">Click to hide</p>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false} onClick={(d: { key?: Slice }) => d?.key && toggle(d.key)}>
                      {rows.map((d) => (
                        <Cell key={d.key} fill={SEC_COLOR[d.key]} cursor="pointer" />
                      ))}
                      {p.labels && <LabelList dataKey="value" position="top" formatter={(v: number) => pctF(v / sum)} fill="rgb(var(--g-300))" fontSize={11} />}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
          <Chips slices={slices} hidden={hidden} onToggle={toggle} onOnly={only} onAll={all} values={now} />
          <label className="inline-flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={p.labels} onChange={(e) => set({ labels: e.target.checked })} /> Show labels
          </label>
        </>
      )}
    </div>
  );
}

function History({ points, loading, p, set, hidden, toggle, only, all }: Shared & { points: HistPoint[]; loading: boolean }) {
  const secs = SECS.filter((s) => !hidden.has(s));
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    const days = { '1m': 31, '3m': 92, '1y': 366, all: 1e6 }[p.range];
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return points
      .filter((r) => r.d >= from)
      .map((r) => {
        const total = secs.reduce((t, s) => t + r[s], 0);
        const o: Record<string, number | string> = { d: r.d, src: r.src, total };
        for (const s of secs) o[s] = p.mode === 'share' ? (total ? r[s] / total : 0) : r[s];
        return o;
      });
  }, [points, p.range, p.mode, secs.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const first = data[0];
  const lastPt = data[data.length - 1];
  const change = first && lastPt && data.length > 1 ? (lastPt.total as number) - (first.total as number) : null;
  const fmt = (v: number) => (p.mode === 'share' ? pctF(v) : usd0(v));
  const n = data.length;
  // a value label at the end of each line (stacked: the band's own value at its middle is hard to read, so the end too)
  const endLabel = (key: string, color: string) =>
    p.labels
      ? (props: { index?: number; x?: number; y?: number; value?: number | [number, number] }) => {
          if (props.index !== n - 1 || props.x == null || props.y == null) return null;
          const v = Array.isArray(props.value) ? props.value[1] - props.value[0] : props.value;
          if (v == null) return null;
          if (!labelKeys.has(key)) return null;
          return (
            <text x={props.x + 6} y={props.y} dominantBaseline="central" fill={color} fontSize={11} fontWeight={600}>
              {p.mode === 'share' ? pctF(v) : short(v)}
            </text>
          );
        }
      : undefined;
  // end labels: only those far enough apart on the y-axis not to overlap
  const labelKeys = useMemo(() => {
    const last = data[n - 1];
    if (!last) return new Set<string>();
    const keys = p.mode === 'lines' ? [...secs, ...(p.total && secs.length > 1 ? ['total'] : [])] : p.mode === 'share' ? secs : ['total'];
    const pos = (k: string) => {
      if (p.mode !== 'share') return Number(last[k]) || 0;
      let y = 0;
      for (const s of secs) {
        y += Number(last[s]) || 0;
        if (s === k) return y;
      }
      return y;
    };
    const max = p.mode === 'share' ? 1 : Math.max(1, ...data.map((r) => Math.max(Number(r.total) || 0, ...secs.map((s) => Number(r[s]) || 0))));
    const keep: number[] = [];
    const out = new Set<string>();
    for (const k of [...keys].sort((a, b) => pos(b) - pos(a))) {
      const y = pos(k);
      if (keep.every((x) => Math.abs(x - y) >= max * 0.07)) {
        keep.push(y);
        out.add(k);
      }
    }
    return out;
  }, [data, n, p.mode, p.total, secs.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const pt = data[hover ?? n - 1];

  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="stat-label">Value over time</p>
        <div className="flex flex-wrap gap-2">
          <Seg label="Chart style" value={p.mode} onChange={(mode) => set({ mode })} options={[['lines', 'Lines'], ['stack', 'Stacked'], ['share', 'Share %']]} />
          <Seg label="Time range" value={p.range} onChange={(range) => set({ range })} options={[['1m', '1M'], ['3m', '3M'], ['1y', '1Y'], ['all', 'All']]} />
        </div>
      </div>
      {pt && (
        <div className="flex min-h-[2.5rem] flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-md border border-bg-border bg-bg/60 px-3 py-1.5 text-sm tabular-nums" aria-live="polite">
          <span className="text-gray-400">{hover == null ? `Latest · ${pt.d}` : pt.d}</span>
          {p.mode !== 'share' && <span className="font-semibold text-gray-100">Total {usd0(pt.total as number)}</span>}
          {hover == null && change != null && p.mode !== 'share' && (
            <span className={change >= 0 ? 'text-gain' : 'text-loss'}>
              {change >= 0 ? '+' : '−'}
              {usd0(Math.abs(change))} since {first!.d}
            </span>
          )}
          {hover != null &&
            secs.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 text-gray-200">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SEC_COLOR[s] }} />
                {SEC_LABEL[s]} {fmt(pt[s] as number)}
              </span>
            ))}
        </div>
      )}
      <div className="h-72 w-full touch-pan-y">
        {n < 2 ? (
          <p className="py-16 text-center text-sm text-gray-400">
            {loading ? 'Loading…' : 'The history starts today: a point is saved each day this page is opened (and from your mes.fm/summary checks).'}
          </p>
        ) : secs.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-400">Every section is hidden. Click one below.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ left: 0, right: p.labels ? 52 : 8, top: 8, bottom: 0 }}
              onMouseMove={(e: { activeTooltipIndex?: number }) => setHover(typeof e?.activeTooltipIndex === 'number' ? e.activeTooltipIndex : null)}
              onMouseLeave={() => setHover(null)}
            >
              <CartesianGrid stroke="rgb(var(--c-border))" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tick={axisTick} minTickGap={40} />
              <YAxis tick={axisTick} width={52} tickFormatter={p.mode === 'share' ? (v: number) => pctF(v) : short} domain={p.mode === 'share' ? [0, 1] : ['auto', 'auto']} />
              <Tooltip content={() => null} cursor={{ stroke: 'rgb(var(--g-300))', strokeWidth: 1.5, strokeDasharray: '4 3' }} />
              {p.mode === 'lines'
                ? secs.map((s) => (
                    <Line key={s} type="monotone" dataKey={s} name={SEC_LABEL[s]} stroke={SEC_COLOR[s]} strokeWidth={2} dot={n <= 40 ? { r: 2 } : false} isAnimationActive={false}>
                      {p.labels && <LabelList content={endLabel(s, SEC_COLOR[s]) as never} />}
                    </Line>
                  ))
                : secs.map((s) => (
                    <Area key={s} type="monotone" dataKey={s} name={SEC_LABEL[s]} stackId="1" stroke={SEC_COLOR[s]} fill={SEC_COLOR[s]} fillOpacity={0.55} isAnimationActive={false}>
                      {p.labels && p.mode === 'share' && <LabelList content={endLabel(s, SEC_COLOR[s]) as never} />}
                    </Area>
                  ))}
              {p.total && p.mode !== 'share' && secs.length > 1 && (
                <Line type="monotone" dataKey="total" name="Total" stroke="rgb(var(--g-100))" strokeWidth={1.5} strokeDasharray={p.mode === 'lines' ? '5 3' : undefined} dot={false} isAnimationActive={false}>
                  {p.labels && <LabelList content={endLabel('total', 'rgb(var(--g-100))') as never} />}
                </Line>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
      <Chips slices={SECS as unknown as Slice[]} hidden={hidden} onToggle={toggle} onOnly={only} onAll={all} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={p.labels} onChange={(e) => set({ labels: e.target.checked })} /> Show labels
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={p.total} onChange={(e) => set({ total: e.target.checked })} /> Total line (of the shown sections)
        </label>
        <span>
          {points.length} day{points.length === 1 ? '' : 's'} of history ·{' '}
          <a href="https://mes.fm/summary" className="text-accent hover:underline">
            mes.fm/summary
          </a>{' '}
          checks fill older dates
        </span>
      </div>
    </div>
  );
}
