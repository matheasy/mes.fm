/**
 * mes.fm/strategy, version 3 (2026-11-27): band rebalancing on a Friday routine. Pure (no fetch, no React).
 *
 *  - Every Friday: look. Nothing is traded unless a section is far outside its band.
 *  - First Friday of the month = move day: every section outside its band goes back to its target,
 *    the Liquidity position's profit goes to Store of Value, and coins over their cap are trimmed.
 *  - First Friday of Jan / Apr / Jul / Oct = quarter review: how the quarter went vs just holding.
 *
 * The old fixed "x% every 30 days" moves are gone: they traded every month whatever the mix was.
 * Bands only trade when something has really drifted, so most months need one or two moves or none.
 * It is a rules calculator for the owner's own targets, not a forecast.
 */
import { BUCKETS, type AcbMap, type Bucket, type Holdings, type LogEntry } from './model';

export interface Settings3 {
  v: 3;
  /** target % per section (rescaled to 100) */
  targets: Record<Bucket, number>;
  /** a section is outside its band when it is this many points away from its target ... */
  bandAbs: number;
  /** ... or this % of its own target, whichever is BIGGER (so small sections don't trade on noise) */
  bandRel: number;
  /** points from "far outside": worth acting on before the next move day */
  urgentAbs: number;
  minTradeUsd: number;
  /** coins worth less than this are not sold from and not bought into by default */
  minHoldingUsd: number;
  /** market mood moves up to this many points of target from Cash LP to Tokens (fearful) or back (greedy) */
  tilt: boolean;
  tiltPts: number;
  /** on move day, the Liquidity position's value above what went in goes to Store of Value */
  harvest: boolean;
  lpBasisUsd: number;
  /** most any one coin may be of the four sections together, % */
  capDefault: number;
  /** per-coin caps that replace the default (your high-conviction coins) */
  caps: Record<string, number>;
  /** new money inside a section goes by this mix (symbol -> share). Empty = Store of Value level, others as now */
  mix: Record<Bucket, Record<string, number>>;
  /** never sold by the plan */
  keep: string[];
}

export const DEFAULT3: Settings3 = {
  v: 3,
  targets: { cash: 15, lp: 15, tokens: 15, sov: 55 },
  bandAbs: 5,
  bandRel: 25,
  urgentAbs: 12,
  minTradeUsd: 100,
  minHoldingUsd: 200,
  tilt: true,
  tiltPts: 4,
  harvest: true,
  lpBasisUsd: 4777.13,
  capDefault: 35,
  caps: { XRP: 45, HIVE: 30 },
  mix: { cash: { HBD: 100 }, lp: {}, tokens: {}, sov: {} },
  keep: ['TGLD', 'SURGE', 'ACE', 'BTC/HBD pool'],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
const symMap = (o: unknown, hi: number): Record<string, number> => {
  const out: Record<string, number> = {};
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k && typeof v === 'number' && v >= 0) out[k.toUpperCase().slice(0, 30)] = clamp(v, 0, hi);
  return out;
};

/** Fills in anything missing; reads the old v2 settings (targets, minimum trade, LP cost, keep list, destinations) */
export function normalize3(raw: unknown): Settings3 {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT3;
  const t = (r.targets ?? {}) as Record<string, unknown>;
  const mixIn = (r.v === 3 ? r.mix : r.dest) as Record<string, unknown> | undefined;
  return {
    v: 3,
    targets: Object.fromEntries(BUCKETS.map((b) => [b, num(t[b], d.targets[b], 0, 100)])) as Record<Bucket, number>,
    bandAbs: num(r.bandAbs, d.bandAbs, 1, 30),
    bandRel: num(r.bandRel, d.bandRel, 0, 100),
    urgentAbs: num(r.urgentAbs, d.urgentAbs, 3, 50),
    minTradeUsd: num(r.minTradeUsd, d.minTradeUsd, 0, 1e6),
    minHoldingUsd: num(r.minHoldingUsd, d.minHoldingUsd, 0, 1e7),
    tilt: typeof r.tilt === 'boolean' ? r.tilt : d.tilt,
    tiltPts: num(r.tiltPts, d.tiltPts, 0, 15),
    harvest: typeof r.harvest === 'boolean' ? r.harvest : d.harvest,
    lpBasisUsd: num(r.lpBasisUsd, d.lpBasisUsd, 0, 1e9),
    capDefault: num(r.capDefault, d.capDefault, 5, 100),
    caps: r.v === 3 ? symMap(r.caps, 100) : { ...d.caps },
    mix: {
      cash: mixIn?.cash ? symMap(mixIn.cash, 1000) : { ...d.mix.cash },
      lp: {},
      tokens: symMap(mixIn?.tokens, 1000),
      sov: symMap(mixIn?.sov, 1000),
    },
    keep: Array.isArray(r.keep) ? r.keep.filter((s): s is string => typeof s === 'string').map((s) => s.slice(0, 30)).slice(0, 40) : [...d.keep],
  };
}

export const normTargets3 = (t: Record<Bucket, number>): Record<Bucket, number> => {
  const s = BUCKETS.reduce((x, b) => x + t[b], 0) || 1;
  return { cash: t.cash / s, lp: t.lp / s, tokens: t.tokens / s, sov: t.sov / s };
};

/* ------------------------------------------------------------------ calendar */

export type DayKind = 'quarter' | 'month' | 'week' | 'none';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** first Friday of a month (local dates) */
export function firstFriday(y: number, m: number): Date {
  const d = new Date(y, m, 1);
  d.setDate(1 + ((5 - d.getDay() + 7) % 7));
  return d;
}
const isQuarterMonth = (m: number) => m % 3 === 0;

export interface Schedule {
  today: string;
  kind: DayKind;
  /** the next Friday on or after today */
  nextFriday: string;
  /** this month's move day and the next one after today */
  thisMoveDay: string;
  nextMoveDay: string;
  /** the latest quarter-review day on or before today, and the next one */
  quarterStart: string;
  nextQuarter: string;
  daysToMove: number;
}

/** All in the browser's local time: the routine is "Friday morning where you are" */
export function schedule(now: Date): Schedule {
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const ff = firstFriday(t.getFullYear(), t.getMonth());
  const isFri = t.getDay() === 5;
  const isMove = isFri && ff.getTime() === t.getTime();
  const kind: DayKind = isMove ? (isQuarterMonth(t.getMonth()) ? 'quarter' : 'month') : isFri ? 'week' : 'none';
  const nf = new Date(t);
  nf.setDate(t.getDate() + ((5 - t.getDay() + 7) % 7));
  let nm = ff;
  if (nm.getTime() <= t.getTime()) nm = firstFriday(t.getFullYear(), t.getMonth() + 1);
  if (isMove) nm = firstFriday(t.getFullYear(), t.getMonth() + 1);
  // quarter days
  let qy = t.getFullYear();
  let qm = t.getMonth() - (t.getMonth() % 3);
  let qs = firstFriday(qy, qm);
  if (qs.getTime() > t.getTime()) {
    qm -= 3;
    if (qm < 0) {
      qm += 12;
      qy -= 1;
    }
    qs = firstFriday(qy, qm);
  }
  let nq = firstFriday(qy, qm + 3);
  if (nq.getTime() <= t.getTime()) nq = firstFriday(qy, qm + 6);
  return {
    today: ymd(t),
    kind,
    nextFriday: ymd(nf),
    thisMoveDay: ymd(ff),
    nextMoveDay: ymd(nm),
    quarterStart: ymd(qs),
    nextQuarter: ymd(nq),
    daysToMove: Math.round((nm.getTime() - t.getTime()) / 86_400_000),
  };
}

/* ------------------------------------------------------------------ mix + bands */

export interface MixRow {
  bucket: Bucket;
  value: number;
  weight: number;
  target: number;
  /** target before the market nudge */
  baseTarget: number;
  band: number;
  /** weight - target (fraction) */
  off: number;
  status: 'ok' | 'over' | 'under';
  urgent: boolean;
}

export function bandOf(target: number, s: Settings3) {
  return Math.max(s.bandAbs / 100, target * (s.bandRel / 100));
}

/** risk: -1 greedy .. +1 fearful. Fearful moves target from Cash LP to Tokens */
export function effTargets(s: Settings3, risk: number): { t: Record<Bucket, number>; shift: number } {
  const base = normTargets3(s.targets);
  if (!s.tilt) return { t: base, shift: 0 };
  let shift = clamp(risk, -1, 1) * (s.tiltPts / 100);
  shift = clamp(shift, -base.tokens, base.cash);
  return { t: { ...base, cash: base.cash - shift, tokens: base.tokens + shift }, shift };
}

export function mixRows(h: Holdings, s: Settings3, risk: number): MixRow[] {
  const base = normTargets3(s.targets);
  const { t } = effTargets(s, risk);
  const all = h.all || 1;
  return BUCKETS.map((b) => {
    const w = h.total[b] / all;
    const band = bandOf(t[b], s);
    const off = w - t[b];
    return {
      bucket: b,
      value: h.total[b],
      weight: w,
      target: t[b],
      baseTarget: base[b],
      band,
      off,
      status: off > band ? 'over' : off < -band ? 'under' : 'ok',
      urgent: Math.abs(off) * 100 >= s.urgentAbs,
    };
  });
}

/* ------------------------------------------------------------------ coins + caps */

export interface CoinRow {
  key: string;
  bucket: Bucket;
  value: number;
  share: number;
  cap: number;
  over: boolean;
  /** a cap set by hand for this coin */
  own: boolean;
}

/** The biggest coins as a share of the four sections together (same symbol in two sections is added up) */
export function coinRows(h: Holdings, s: Settings3): CoinRow[] {
  const by = new Map<string, { value: number; bucket: Bucket; top: number }>();
  for (const it of h.items) {
    if (it.bucket === 'lp') continue;
    const k = it.key.toUpperCase().replace(/^SWAP\./, '');
    const x = by.get(k) ?? { value: 0, bucket: it.bucket, top: 0 };
    x.value += it.valueUsd;
    if (it.valueUsd > x.top) {
      x.top = it.valueUsd;
      x.bucket = it.bucket;
    }
    by.set(k, x);
  }
  const all = h.all || 1;
  return [...by.entries()]
    .map(([key, x]) => {
      const cap = (s.caps[key] ?? s.capDefault) / 100;
      return { key, bucket: x.bucket, value: x.value, share: x.value / all, cap, over: x.value / all > cap, own: key in s.caps };
    })
    .sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ the moves */

export interface Leg {
  key: string;
  usd: number;
  amount: number | null;
}

export interface Action {
  id: string;
  kind: 'rebalance' | 'harvest' | 'trim';
  from: Bucket;
  to: Bucket;
  usd: number;
  sells: Leg[];
  buys: Leg[];
  why: string;
}

export interface Plan {
  actions: Action[];
  /** a move smaller than the minimum was left out */
  skippedSmall: number;
  rows: MixRow[];
  shift: number;
  lp: { basis: number; profit: number | null };
}

const keepSet = (s: Settings3) => new Set(s.keep.map((k) => k.toUpperCase()));
const round10 = (v: number) => Math.round(v / 10) * 10;
const priceOf = (h: Holdings['items'][number]) => (h.amount && h.amount > 0 ? h.valueUsd / h.amount : null);

/** What went into Liquidity: the starting amount + moves into it - money taken out (profit sweeps don't count) */
export function lpBasis(s: Settings3, log: LogEntry[]): number {
  let b = s.lpBasisUsd;
  for (const e of log) {
    if (e.skipped) continue;
    if (e.to === 'lp') b += e.usd;
    else if (e.lpUsd) b += e.lpUsd;
    if (e.from === 'lp' && e.moveId !== 'lp2s' && e.moveId !== 'harvest') b -= e.usd;
  }
  return b;
}

/** In-section mix for new money: as set, else level (Store of Value) / as now (the rest) */
function mixOf(b: Bucket, items: Holdings['items'], s: Settings3, keep: Set<string>): Record<string, number> {
  const set = s.mix[b];
  if (set && Object.keys(set).length) {
    const o: Record<string, number> = {};
    for (const [k, v] of Object.entries(set)) if (v > 0) o[k.toUpperCase()] = v;
    if (Object.keys(o).length) return o;
  }
  const el = items.filter((i) => i.valueUsd >= s.minHoldingUsd && !keep.has(i.key.toUpperCase()));
  const list = el.length ? el : items.filter((i) => !keep.has(i.key.toUpperCase()));
  const o: Record<string, number> = {};
  for (const i of list) o[i.key.toUpperCase()] = b === 'sov' ? 1 : i.valueUsd;
  return o;
}

function buyLegs(b: Bucket, amt: number, h: Holdings, s: Settings3, coins: CoinRow[], exclude = new Set<string>()): Leg[] {
  const items = h.items.filter((i) => i.bucket === b);
  if (b === 'lp') return [{ key: items[0]?.key ?? 'Liquidity', usd: amt, amount: null }];
  const keep = keepSet(s);
  let mix = mixOf(b, items, s, keep);
  // coins at or over their cap get no new money
  const capped = new Set(coins.filter((c) => c.over).map((c) => c.key));
  const open = Object.fromEntries(Object.entries(mix).filter(([k]) => !capped.has(k) && !exclude.has(k)));
  if (Object.keys(open).length) mix = open;
  const tw = Object.values(mix).reduce((x, v) => x + v, 0) || 1;
  const cur = (k: string) => items.filter((i) => i.key.toUpperCase() === k).reduce((x, i) => x + i.valueUsd, 0);
  const total = Object.keys(mix).reduce((x, k) => x + cur(k), 0) + amt;
  const gaps = Object.keys(mix).map((k) => ({ k, gap: Math.max(0, (total * mix[k]!) / tw - cur(k)) }));
  const gs = gaps.reduce((x, g) => x + g.gap, 0);
  return gaps
    .map((g) => {
      const usd = gs > 0 ? (amt * g.gap) / gs : (amt * mix[g.k]!) / tw;
      const it = items.find((i) => i.key.toUpperCase() === g.k);
      const p = it ? priceOf(it) : null;
      return { key: g.k, usd, amount: p ? usd / p : null };
    })
    .filter((l) => l.usd >= 1)
    .sort((a, b) => b.usd - a.usd);
}

function sellLegs(b: Bucket, amt: number, h: Holdings, s: Settings3, coins: CoinRow[]): Leg[] {
  const items = h.items.filter((i) => i.bucket === b);
  if (b === 'lp') return [{ key: items[0]?.key ?? 'Liquidity', usd: amt, amount: null }];
  const keep = keepSet(s);
  const any = items.filter((i) => !keep.has(i.key.toUpperCase()) && i.valueUsd > 0);
  // small coins are left alone unless the big ones can't cover the move
  const big = any.filter((i) => i.valueUsd >= s.minHoldingUsd);
  const el = big.reduce((x, i) => x + i.valueUsd, 0) >= amt ? big : any;
  if (!el.length) return [];
  const mix = mixOf(b, items, s, keep);
  const tw = Object.values(mix).reduce((x, v) => x + v, 0) || 1;
  const left = new Map(el.map((i) => [i, i.valueUsd]));
  const out = new Map<Holdings['items'][number], number>();
  let rest = amt;
  const take = (i: Holdings['items'][number], v: number) => {
    const t = Math.min(v, left.get(i) ?? 0, rest);
    if (t <= 0) return;
    out.set(i, (out.get(i) ?? 0) + t);
    left.set(i, (left.get(i) ?? 0) - t);
    rest -= t;
  };
  // 1. coins over their cap, down to the cap
  for (const c of coins.filter((c) => c.over && c.bucket === b)) {
    const it = el.find((i) => i.key.toUpperCase() === c.key);
    if (it) take(it, (c.share - c.cap) * h.all);
  }
  // 2. what is above its share of the section
  const after = el.reduce((x, i) => x + (left.get(i) ?? 0), 0) - rest;
  const ex = el.map((i) => ({ i, e: Math.max(0, (left.get(i) ?? 0) - (after * (mix[i.key.toUpperCase()] ?? 0)) / tw) }));
  const es = ex.reduce((x, e) => x + e.e, 0);
  if (es > 0 && rest > 0) {
    const r0 = rest;
    for (const e of ex) take(e.i, (r0 * e.e) / es);
  }
  // 3. anything left: by size
  if (rest > 0.5) {
    const vs = el.reduce((x, i) => x + (left.get(i) ?? 0), 0);
    const r0 = rest;
    for (const i of el) take(i, (r0 * (left.get(i) ?? 0)) / (vs || 1));
  }
  return [...out.entries()]
    .map(([i, usd]) => {
      const p = priceOf(i);
      return { key: i.key, usd, amount: p ? usd / p : null };
    })
    .filter((l) => l.usd >= 1)
    .sort((a, b) => b.usd - a.usd);
}

/** The move-day plan for today's numbers */
export function makePlan(h: Holdings, s: Settings3, risk: number, log: LogEntry[], lpValue: number | null): Plan {
  const rows = mixRows(h, s, risk);
  const { t, shift } = effTargets(s, risk);
  const coins = coinRows(h, s);
  const v: Record<Bucket, number> = { ...h.total };
  const flows: { from: Bucket; to: Bucket; usd: number; kind: Action['kind'] }[] = [];
  const basis = lpBasis(s, log);
  const profit = lpValue != null ? lpValue - basis : null;
  let skippedSmall = 0;

  // 1. Liquidity profit -> Store of Value
  if (s.harvest && profit != null && profit >= s.minTradeUsd) {
    flows.push({ from: 'lp', to: 'sov', usd: profit, kind: 'harvest' });
    v.lp -= profit;
    v.sov += profit;
  }

  // 2. sections outside their band go back to target; the sections inside it make up the difference
  const T = BUCKETS.reduce((x, b) => x + v[b], 0) || 1;
  const D = Object.fromEntries(BUCKETS.map((b) => [b, t[b] * T - v[b]])) as Record<Bucket, number>;
  const out = BUCKETS.filter((b) => Math.abs(v[b] / T - t[b]) > bandOf(t[b], s));
  if (out.length) {
    const need: Record<Bucket, number> = { cash: 0, lp: 0, tokens: 0, sov: 0 };
    for (const b of out) need[b] = D[b];
    let net = out.reduce((x, b) => x + D[b], 0);
    const inside = BUCKETS.filter((b) => !out.includes(b));
    // first from the inside sections already leaning the right way, up to their own gap
    const lean = inside.filter((b) => Math.sign(D[b]) === -Math.sign(net) && D[b] !== 0);
    const ls = lean.reduce((x, b) => x + Math.abs(D[b]), 0);
    if (ls > 0) {
      const part = Math.min(Math.abs(net), ls);
      for (const b of lean) need[b] += -Math.sign(net) * (part * Math.abs(D[b])) / ls;
      net -= Math.sign(net) * part;
    }
    // then spread by target
    if (Math.abs(net) > 0.5 && inside.length) {
      const ts = inside.reduce((x, b) => x + t[b], 0) || 1;
      for (const b of inside) need[b] += (-net * t[b]) / ts;
    }
    const sellers = BUCKETS.filter((b) => need[b] < -0.5).map((b) => ({ b, left: -need[b] }));
    const buyers = BUCKETS.filter((b) => need[b] > 0.5).map((b) => ({ b, left: need[b] }));
    sellers.sort((a, b) => b.left - a.left);
    buyers.sort((a, b) => b.left - a.left);
    for (const se of sellers)
      for (const bu of buyers) {
        const x = Math.min(se.left, bu.left);
        if (x <= 0.5) continue;
        flows.push({ from: se.b, to: bu.b, usd: x, kind: 'rebalance' });
        se.left -= x;
        bu.left -= x;
      }
  }

  // net opposite flows (e.g. a profit sweep LP -> SOV and a refill SOV -> LP)
  const net = new Map<string, { from: Bucket; to: Bucket; usd: number; kinds: Set<Action['kind']> }>();
  for (const f of flows) {
    const k = `${f.from}>${f.to}`;
    const rk = `${f.to}>${f.from}`;
    const r = net.get(rk);
    if (r) {
      if (r.usd >= f.usd) {
        r.usd -= f.usd;
        r.kinds.add(f.kind);
      } else {
        net.delete(rk);
        net.set(k, { from: f.from, to: f.to, usd: f.usd - r.usd, kinds: new Set([...r.kinds, f.kind]) });
      }
    } else {
      const e = net.get(k) ?? { from: f.from, to: f.to, usd: 0, kinds: new Set<Action['kind']>() };
      e.usd += f.usd;
      e.kinds.add(f.kind);
      net.set(k, e);
    }
  }

  const actions: Action[] = [];
  for (const f of net.values()) {
    const usd = round10(f.usd);
    if (usd < s.minTradeUsd) {
      if (f.usd > 1) skippedSmall++;
      continue;
    }
    const kind: Action['kind'] = f.kinds.has('rebalance') ? 'rebalance' : 'harvest';
    const row = rows.find((r) => r.bucket === f.from)!;
    const why =
      kind === 'harvest' && f.kinds.size === 1
        ? `Liquidity profit (worth ${Math.round(lpValue ?? 0)} vs ${Math.round(basis)} put in)`
        : row.status === 'over'
          ? `${pctS(row.weight)} vs target ${pctS(row.target)}`
          : `refills ${pctS(rows.find((r) => r.bucket === f.to)!.weight)} vs target ${pctS(rows.find((r) => r.bucket === f.to)!.target)}`;
    actions.push({
      id: `${kind}:${f.from}>${f.to}`,
      kind,
      from: f.from,
      to: f.to,
      usd,
      sells: sellLegs(f.from, usd, h, s, coins),
      buys: buyLegs(f.to, usd, h, s, coins),
      why,
    });
  }

  // 3. a coin well over its cap: swap the excess for the other coins of its section
  for (const c of coins) {
    if (!(c.share > c.cap + 0.03)) continue;
    const already = actions.filter((a) => a.from === c.bucket).flatMap((a) => a.sells).filter((l) => l.key.toUpperCase() === c.key).reduce((x, l) => x + l.usd, 0);
    const usd = round10((c.share - c.cap) * h.all - already);
    if (usd < s.minTradeUsd) continue;
    const it = h.items.find((i) => i.key.toUpperCase() === c.key && i.bucket === c.bucket);
    const p = it ? priceOf(it) : null;
    let buys = buyLegs(c.bucket, usd, h, s, coins, new Set([c.key]));
    let to = c.bucket;
    if (!buys.length || buys.every((l) => l.key.toUpperCase() === c.key)) {
      to = [...rows].sort((a, b) => a.off - b.off)[0]!.bucket;
      buys = buyLegs(to, usd, h, s, coins, new Set([c.key]));
    }
    actions.push({
      id: `trim:${c.key}`,
      kind: 'trim',
      from: c.bucket,
      to,
      usd,
      sells: [{ key: it?.key ?? c.key, usd, amount: p ? usd / p : null }],
      buys,
      why: `${c.key} is ${pctS(c.share)} of everything, cap ${pctS(c.cap)}`,
    });
  }

  return { actions, skippedSmall, rows, shift, lp: { basis, profit } };
}

const pctS = (f: number) => `${(f * 100).toFixed(1)}%`;

/* ------------------------------------------------------------------ taxes */

const TAX_ALIAS: Record<string, string> = { WBNB: 'BNB', WETH: 'ETH', 'SWAP.HIVE': 'HIVE', BTCB: 'BTC', WBTC: 'BTC', 'SWAP.BTC': 'BTC' };
const taxKey = (k: string) => TAX_ALIAS[k.toUpperCase()] ?? k.toUpperCase();

export interface TaxLine {
  key: string;
  gainCad: number;
  /** a loss that would be superficial because the same plan buys the coin too */
  superficial: boolean;
}

/** Gain or loss (CAD, vs your average cost) of each sell in the plan */
export function taxLines(actions: Action[], acb: AcbMap | null, cadRate: number | null): Record<string, TaxLine[]> {
  const out: Record<string, TaxLine[]> = {};
  if (!acb || !cadRate) return out;
  const bought = new Set(actions.flatMap((a) => a.buys.map((l) => taxKey(l.key))));
  for (const a of actions) {
    const lines: TaxLine[] = [];
    for (const l of a.sells) {
      const k = taxKey(l.key);
      const pool = acb[k];
      if (!pool || !(pool.qty > 0) || l.amount == null || !(l.amount > 0)) continue;
      const costCad = pool.acbCad != null ? pool.acbCad / pool.qty : (pool.acbUsd / pool.qty) * cadRate;
      const gainCad = l.usd * cadRate - l.amount * costCad;
      lines.push({ key: k, gainCad, superficial: gainCad < 0 && bought.has(k) });
    }
    if (lines.length) out[a.id] = lines;
  }
  return out;
}

/* ------------------------------------------------------------------ quarter review */

export interface HistRow {
  d: string;
  cash: number;
  lp: number;
  tokens: number;
  sov: number;
}

export interface Review {
  from: HistRow;
  to: HistRow;
  startTotal: number;
  endTotal: number;
  change: number;
  changePct: number;
  /** what the start mix would be worth now with no moves (estimate from coin prices) */
  holdTotal: number | null;
  moves: number;
  movedUsd: number;
  maxOffPts: number;
}

const tot = (r: HistRow) => r.cash + r.lp + r.tokens + r.sov;

/** `growth[b]` = how much a section's coins rose over the period (1.1 = +10%), null when unknown */
export function review(rows: HistRow[], startDay: string, log: LogEntry[], targets: Record<Bucket, number>, growth: Record<Bucket, number | null> | null): Review | null {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => a.d.localeCompare(b.d));
  // the row closest to the start day (a row from long before it would make it a different period)
  const before = [...sorted].reverse().find((r) => r.d <= startDay) ?? null;
  const after = sorted.find((r) => r.d >= startDay) ?? null;
  const gap = (r: HistRow | null) => (r ? Math.abs(new Date(r.d).getTime() - new Date(startDay).getTime()) : Infinity);
  const from = gap(before) <= Math.min(gap(after), 10 * 86_400_000) ? before : after;
  const to = sorted[sorted.length - 1]!;
  if (!from || from.d >= to.d) return null;
  const startTotal = tot(from);
  const endTotal = tot(to);
  let holdTotal: number | null = null;
  if (growth && BUCKETS.every((b) => growth[b] != null || from[b] < 1)) holdTotal = BUCKETS.reduce((x, b) => x + from[b] * (growth[b] ?? 1), 0);
  const t = normTargets3(targets);
  let maxOff = 0;
  for (const r of sorted.filter((r) => r.d >= from.d)) {
    const a = tot(r) || 1;
    for (const b of BUCKETS) maxOff = Math.max(maxOff, Math.abs(r[b] / a - t[b]) * 100);
  }
  const inQ = log.filter((e) => !e.skipped && e.date >= from.d);
  return {
    from,
    to,
    startTotal,
    endTotal,
    change: endTotal - startTotal,
    changePct: startTotal ? endTotal / startTotal - 1 : 0,
    holdTotal,
    moves: inQ.length,
    movedUsd: inQ.reduce((x, e) => x + e.usd, 0),
    maxOffPts: maxOff,
  };
}
