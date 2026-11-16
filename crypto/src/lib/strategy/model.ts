/**
 * mes.fm/strategy - the rules engine behind the page. Pure (no fetch, no React): the page, the API
 * and the self-check script (scripts/strategy-check.mjs) all use it.
 *
 * The idea: the user's own cycle Cash LP -> Tokens -> Store of Value -> Cash LP, a fixed % of each
 * section every N days, turned into a dated to-do list, with two optional nudges on top:
 *  - market signals (fear & greed, Bitcoin vs its 200-day average, distance from its high, perp funding,
 *    stock fear & greed, HIVE vs BTC trend) make a move bigger or smaller (never more than maxMult x)
 *  - target weights: a section above its target sends more, one below it sends less
 * Every number is shown with the reasons that produced it. It is a rules calculator, not a forecast.
 */

export type Bucket = 'cash' | 'tokens' | 'sov';
export const BUCKETS: Bucket[] = ['cash', 'tokens', 'sov'];
export const BUCKET_LABEL: Record<Bucket, string> = { cash: 'Cash LP', tokens: 'Tokens', sov: 'Store of Value' };
export const BUCKET_LINK: Record<Bucket, string> = { cash: 'https://mes.fm/cash', tokens: 'https://mes.fm/tokens', sov: 'https://mes.fm/sov' };
/** How "risky" a section is, for the direction of the signal nudge: buying riskier = adding risk */
const RISK: Record<Bucket, number> = { cash: 0, sov: 1, tokens: 2 };

export interface Move {
  id: string;
  from: Bucket;
  to: Bucket;
  /** % of the eligible part of `from` moved each time */
  ratePct: number;
  everyDays: number;
  /** let the market signals change the size */
  tilt: boolean;
  on: boolean;
}

export type IndicatorKey = 'fng' | 'mayer' | 'drawdown' | 'funding' | 'stockfg' | 'alt';

export interface Settings {
  v: 1;
  moves: Move[];
  /** a holding must be worth at least this to be sold from (and to be a default place to buy) */
  minHoldingUsd: number;
  /** a move smaller than this is skipped (fees eat it) */
  minTradeUsd: number;
  /** target weights in % (they are rescaled to add to 100) */
  targets: Record<Bucket, number>;
  useTargets: boolean;
  /** 0..1: how much being away from the target changes a move */
  driftWeight: number;
  /** 0..1: how much the signals change a move (1 = a full-strength signal can double or skip it) */
  tiltStrength: number;
  /** a move is never more than this many times its normal size */
  maxMult: number;
  weights: Record<IndicatorKey, number>;
  /** where bought value goes, per section: symbol -> share. Empty = spread over what you already hold */
  dest: Record<Bucket, Record<string, number>>;
  /** never sold by the plan */
  keep: string[];
  feePct: number;
  /** HBD savings interest, used for Cash LP in the backtest */
  cashAprPct: number;
  /** cycle picture: node positions and label nudges (0..100 / px) */
  diagram: { nodes: Record<Bucket, { x: number; y: number }>; labels: Record<string, { dx: number; dy: number }> };
}

export const DEFAULT_SETTINGS: Settings = {
  v: 1,
  moves: [
    { id: 'c2t', from: 'cash', to: 'tokens', ratePct: 4, everyDays: 30, tilt: true, on: true },
    { id: 't2s', from: 'tokens', to: 'sov', ratePct: 3, everyDays: 30, tilt: true, on: true },
    { id: 's2c', from: 'sov', to: 'cash', ratePct: 2, everyDays: 30, tilt: true, on: true },
  ],
  minHoldingUsd: 500,
  minTradeUsd: 20,
  targets: { cash: 15, tokens: 25, sov: 60 },
  useTargets: false,
  driftWeight: 0.5,
  tiltStrength: 0.5,
  maxMult: 2,
  weights: { fng: 1, mayer: 1, drawdown: 0.5, funding: 0.5, stockfg: 0.25, alt: 1 },
  dest: { cash: { HBD: 100 }, tokens: {}, sov: {} },
  keep: ['TGLD', 'SURGE', 'ACE', 'BTC/HBD pool'],
  feePct: 0.3,
  cashAprPct: 15,
  diagram: {
    nodes: { cash: { x: 20, y: 72 }, tokens: { x: 50, y: 18 }, sov: { x: 80, y: 72 } },
    labels: {},
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);

/** Fills in anything missing or out of range (old saves, hand-edited JSON) */
export function normalize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  const d = DEFAULT_SETTINGS;
  const isB = (b: unknown): b is Bucket => b === 'cash' || b === 'tokens' || b === 'sov';
  const moves = Array.isArray(r.moves)
    ? r.moves
        .filter((m) => m && isB(m.from) && isB(m.to) && m.from !== m.to)
        .slice(0, 8)
        .map((m, i) => ({
          id: typeof m.id === 'string' && m.id ? m.id.slice(0, 20) : `m${i}`,
          from: m.from,
          to: m.to,
          ratePct: num(m.ratePct, 2, 0, 50),
          everyDays: Math.round(num(m.everyDays, 30, 1, 365)),
          tilt: m.tilt !== false,
          on: m.on !== false,
        }))
    : d.moves.map((m) => ({ ...m }));
  const t = (r.targets ?? {}) as Partial<Record<Bucket, number>>;
  const w = (r.weights ?? {}) as Partial<Record<IndicatorKey, number>>;
  const dest = (r.dest ?? {}) as Partial<Record<Bucket, Record<string, number>>>;
  const cleanDest = (o: unknown) => {
    const out: Record<string, number> = {};
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k && typeof v === 'number' && v > 0) out[k.slice(0, 30)] = clamp(v, 0, 1000);
    return out;
  };
  const dg = (r.diagram ?? {}) as Partial<Settings['diagram']>;
  const nodes = { ...d.diagram.nodes };
  for (const b of BUCKETS) {
    const n = dg.nodes?.[b];
    if (n) nodes[b] = { x: num(n.x, nodes[b].x, 5, 95), y: num(n.y, nodes[b].y, 8, 92) };
  }
  const labels: Settings['diagram']['labels'] = {};
  if (dg.labels && typeof dg.labels === 'object')
    for (const [k, v] of Object.entries(dg.labels)) if (v) labels[k.slice(0, 30)] = { dx: num(v.dx, 0, -400, 400), dy: num(v.dy, 0, -400, 400) };
  return {
    v: 1,
    moves,
    minHoldingUsd: num(r.minHoldingUsd, d.minHoldingUsd, 0, 1e7),
    minTradeUsd: num(r.minTradeUsd, d.minTradeUsd, 0, 1e6),
    targets: { cash: num(t.cash, d.targets.cash, 0, 100), tokens: num(t.tokens, d.targets.tokens, 0, 100), sov: num(t.sov, d.targets.sov, 0, 100) },
    useTargets: r.useTargets ?? d.useTargets,
    driftWeight: num(r.driftWeight, d.driftWeight, 0, 1),
    tiltStrength: num(r.tiltStrength, d.tiltStrength, 0, 1),
    maxMult: num(r.maxMult, d.maxMult, 1, 5),
    weights: {
      fng: num(w.fng, d.weights.fng, 0, 3),
      mayer: num(w.mayer, d.weights.mayer, 0, 3),
      drawdown: num(w.drawdown, d.weights.drawdown, 0, 3),
      funding: num(w.funding, d.weights.funding, 0, 3),
      stockfg: num(w.stockfg, d.weights.stockfg, 0, 3),
      alt: num(w.alt, d.weights.alt, 0, 3),
    },
    dest: { cash: cleanDest(dest.cash ?? d.dest.cash), tokens: cleanDest(dest.tokens), sov: cleanDest(dest.sov) },
    keep: Array.isArray(r.keep) ? r.keep.filter((s) => typeof s === 'string').map((s) => s.slice(0, 30)).slice(0, 40) : [...d.keep],
    feePct: num(r.feePct, d.feePct, 0, 5),
    cashAprPct: num(r.cashAprPct, d.cashAprPct, 0, 50),
    diagram: { nodes, labels },
  };
}

/* ------------------------------------------------------------------ holdings */

export interface Holding {
  bucket: Bucket;
  key: string;
  name: string;
  valueUsd: number;
  amount: number | null;
}

export interface Holdings {
  items: Holding[];
  total: Record<Bucket, number>;
  all: number;
}

export function holdingsFrom(cash: { key: string; name: string; valueUsd: number; amount: number | null }[], tokens: typeof cash, sov: typeof cash): Holdings {
  const items: Holding[] = [
    ...cash.map((h) => ({ ...h, bucket: 'cash' as const })),
    ...tokens.map((h) => ({ ...h, bucket: 'tokens' as const })),
    ...sov.map((h) => ({ ...h, bucket: 'sov' as const })),
  ];
  const total = { cash: 0, tokens: 0, sov: 0 };
  for (const h of items) total[h.bucket] += h.valueUsd;
  return { items, total, all: total.cash + total.tokens + total.sov };
}

export function weightsOf(h: Holdings): Record<Bucket, number> {
  const a = h.all || 1;
  return { cash: h.total.cash / a, tokens: h.total.tokens / a, sov: h.total.sov / a };
}

export function normTargets(t: Record<Bucket, number>): Record<Bucket, number> {
  const s = t.cash + t.tokens + t.sov;
  if (!(s > 0)) return { cash: 1 / 3, tokens: 1 / 3, sov: 1 / 3 };
  return { cash: t.cash / s, tokens: t.tokens / s, sov: t.sov / s };
}

/* ------------------------------------------------------------------ indicators */

export interface Indicator {
  key: IndicatorKey;
  name: string;
  value: string;
  /** -1..+1, + = "cheap / fearful" (adding risk is favoured); for `alt`: + = tokens strong vs Bitcoin */
  score: number;
  note: string;
  asOf?: string;
}

export interface MarketInputs {
  fng?: number | null;
  /** BTC price / its 200-day average */
  mayer?: number | null;
  /** % below the all-time high (negative, e.g. -38) */
  drawdownPct?: number | null;
  /** BTC perp funding, yearly % */
  fundingApr?: number | null;
  stockFg?: number | null;
  /** HIVE/BTC now vs its 90-day average, as a fraction (+0.2 = 20% above) */
  altVs90?: number | null;
}

export const SCORE = {
  fng: (v: number) => clamp((50 - v) / 40, -1, 1),
  mayer: (m: number) => clamp(-Math.log(m / 1.1) / Math.log(1.6), -1, 1),
  drawdown: (dd: number) => clamp((-dd - 25) / 25, -1, 1),
  funding: (apr: number) => clamp(-(apr - 10) / 25, -1, 1),
  stockfg: (v: number) => clamp((50 - v) / 40, -1, 1),
  alt: (r: number) => clamp(r / 0.25, -1, 1),
};

export function indicators(m: MarketInputs): Indicator[] {
  const out: Indicator[] = [];
  const pct = (v: number, d = 0) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
  if (m.fng != null)
    out.push({ key: 'fng', name: 'Crypto Fear & Greed', value: `${Math.round(m.fng)} / 100`, score: SCORE.fng(m.fng), note: 'Under 25 = extreme fear (historically better times to add), over 75 = extreme greed.' });
  if (m.mayer != null)
    out.push({ key: 'mayer', name: 'Bitcoin vs its 200-day average', value: `${m.mayer.toFixed(2)}×`, score: SCORE.mayer(m.mayer), note: 'Under 1 = below its long trend; over ~1.8 = stretched. Neutral at 1.1.' });
  if (m.drawdownPct != null)
    out.push({ key: 'drawdown', name: 'Bitcoin below its all-time high', value: pct(m.drawdownPct), score: SCORE.drawdown(m.drawdownPct), note: '-50% or deeper scores fully "cheap"; near the high scores "expensive". Neutral at -25%.' });
  if (m.fundingApr != null)
    out.push({ key: 'funding', name: 'Bitcoin perp funding', value: `${m.fundingApr.toFixed(1)}% a year`, score: SCORE.funding(m.fundingApr), note: 'Traders paying a lot to stay long = crowded; negative = shorts crowded. Normal ~10%.' });
  if (m.stockFg != null)
    out.push({ key: 'stockfg', name: 'Stock Fear & Greed (MES)', value: `${Math.round(m.stockFg)} / 100`, score: SCORE.stockfg(m.stockFg), note: 'Risk mood in stocks; crypto usually moves with it. Small weight by default.' });
  if (m.altVs90 != null)
    out.push({ key: 'alt', name: 'HIVE vs Bitcoin (90-day)', value: pct(m.altVs90 * 100, 1), score: SCORE.alt(m.altVs90), note: 'Above its 90-day average = tokens have been strong: trim more of them into Store of Value. Below = trim less.' });
  return out;
}

/** The combined "add risk" score -1..+1 and how much the risk indicators agree with its sign (0..1) */
export function riskScore(inds: Indicator[], w: Settings['weights']): { score: number; agreement: number; used: number } {
  const risk = inds.filter((i) => i.key !== 'alt' && (w[i.key] ?? 0) > 0);
  const tw = risk.reduce((s, i) => s + w[i.key], 0);
  if (!tw) return { score: 0, agreement: 0, used: 0 };
  const score = risk.reduce((s, i) => s + w[i.key] * i.score, 0) / tw;
  const sign = Math.sign(score);
  const agree = sign === 0 ? 0 : risk.reduce((s, i) => s + (Math.sign(i.score) === sign && Math.abs(i.score) > 0.1 ? w[i.key] : 0), 0) / tw;
  return { score, agreement: agree, used: risk.length };
}

export function stanceOf(score: number): { label: string; tone: 'buy' | 'sell' | 'neutral' } {
  if (score >= 0.6) return { label: 'Strong fear: lean into adding risk', tone: 'buy' };
  if (score >= 0.2) return { label: 'Fearful: add a bit more, sell a bit less', tone: 'buy' };
  if (score > -0.2) return { label: 'Neutral: follow the plan as written', tone: 'neutral' };
  if (score > -0.6) return { label: 'Greedy: add a bit less, take a bit more off', tone: 'sell' };
  return { label: 'Strong greed: slow buying, take profits', tone: 'sell' };
}

/* ------------------------------------------------------------------ the plan */

export interface Reason {
  label: string;
  mult: number;
}

export interface Leg {
  key: string;
  name: string;
  usd: number;
  /** amount of the coin, when its price is known */
  amount: number | null;
}

export interface PlannedMove {
  move: Move;
  eligibleUsd: number;
  baseUsd: number;
  mult: number;
  reasons: Reason[];
  usd: number;
  skipped: string | null;
  /** -1..1 signal for this move's direction, and agreement 0..1 */
  signal: number;
  agreement: number;
  sells: Leg[];
  buys: Leg[];
  lastDone: string | null;
  dueOn: string;
  dueInDays: number;
}

export interface LogEntry {
  id: string;
  moveId: string;
  date: string; // yyyy-mm-dd
  usd: number;
  from: Bucket;
  to: Bucket;
  note?: string;
  skipped?: boolean;
}

const DAY = 86_400_000;
export const isoDay = (t: number | Date) => new Date(t).toISOString().slice(0, 10);

/** The multiplier for one move from the signals: buying a riskier section follows the risk score,
 * selling one follows it backwards; Tokens <-> Store of Value also follows the HIVE/BTC trend. */
export function moveSignal(move: Move, risk: number, alt: number | null, s: Settings): number {
  const dir = Math.sign(RISK[move.to] - RISK[move.from]); // +1 = into something riskier
  let sig = dir * risk;
  const pair = (move.from === 'tokens' && move.to === 'sov') || (move.from === 'sov' && move.to === 'tokens');
  if (pair && alt != null && s.weights.alt > 0) {
    const a = move.from === 'tokens' ? alt : -alt; // tokens strong -> move more out of tokens
    const wa = s.weights.alt / (s.weights.alt + 1);
    sig = (1 - wa) * sig + wa * a;
  }
  return clamp(sig, -1, 1);
}

export function driftMult(move: Move, w: Record<Bucket, number>, s: Settings): number {
  if (!s.useTargets || s.driftWeight <= 0) return 1;
  const t = normTargets(s.targets);
  const dev = (b: Bucket) => (t[b] > 0 ? clamp((w[b] - t[b]) / t[b], -1, 1) : w[b] > 0 ? 1 : 0);
  return clamp(1 + s.driftWeight * (dev(move.from) - dev(move.to)), 0, s.maxMult);
}

function split(total: number, parts: { key: string; name: string; weight: number; price: number | null }[]): Leg[] {
  const tw = parts.reduce((s, p) => s + p.weight, 0);
  if (!(tw > 0) || !(total > 0)) return [];
  return parts
    .filter((p) => p.weight > 0)
    .map((p) => {
      const usd = (total * p.weight) / tw;
      return { key: p.key, name: p.name, usd, amount: p.price ? usd / p.price : null };
    })
    .sort((a, b) => b.usd - a.usd);
}

export function plan(h: Holdings, s: Settings, inds: Indicator[], log: LogEntry[], now = Date.now()): PlannedMove[] {
  const w = weightsOf(h);
  const r = riskScore(inds, s.weights);
  const altInd = inds.find((i) => i.key === 'alt');
  const keep = new Set(s.keep.map((k) => k.toUpperCase()));
  const priceOf = (x: Holding) => (x.amount && x.amount > 0 ? x.valueUsd / x.amount : null);
  return s.moves
    .filter((m) => m.on)
    .map((m) => {
      const src = h.items.filter((x) => x.bucket === m.from && x.valueUsd >= s.minHoldingUsd && !keep.has(x.key.toUpperCase()));
      const eligibleUsd = src.reduce((t, x) => t + x.valueUsd, 0);
      const baseUsd = (eligibleUsd * m.ratePct) / 100;
      const reasons: Reason[] = [];
      const sig = m.tilt ? moveSignal(m, r.score, altInd ? altInd.score : null, s) : 0;
      let mult = 1;
      if (m.tilt && s.tiltStrength > 0) {
        const t = clamp(1 + s.tiltStrength * sig, 0, s.maxMult);
        reasons.push({ label: 'Market signals', mult: t });
        mult *= t;
      }
      const dm = driftMult(m, w, s);
      if (s.useTargets && s.driftWeight > 0) {
        reasons.push({ label: 'Distance from targets', mult: dm });
        mult *= dm;
      }
      mult = clamp(mult, 0, s.maxMult);
      let usd = baseUsd * mult;
      let skipped: string | null = null;
      if (!src.length) skipped = `Nothing in ${BUCKET_LABEL[m.from]} is worth $${s.minHoldingUsd.toLocaleString()} or more`;
      else if (mult === 0) skipped = 'Signals and targets both say wait this time';
      else if (usd < s.minTradeUsd) skipped = `Under the $${s.minTradeUsd} minimum trade`;
      if (skipped) usd = 0;

      const sells = split(usd, src.map((x) => ({ key: x.key, name: x.name, weight: x.valueUsd, price: priceOf(x) })));
      const destCfg = s.dest[m.to] ?? {};
      const destParts = Object.keys(destCfg).length
        ? Object.entries(destCfg).map(([k, wt]) => {
            const held = h.items.find((x) => x.bucket === m.to && x.key.toUpperCase() === k.toUpperCase());
            return { key: k, name: held?.name ?? k, weight: wt, price: held ? priceOf(held) : null };
          })
        : (() => {
            const held = h.items.filter((x) => x.bucket === m.to && !keep.has(x.key.toUpperCase()) && x.amount !== null);
            const big = held.filter((x) => x.valueUsd >= s.minHoldingUsd);
            return (big.length ? big : held.slice(0, 3)).map((x) => ({ key: x.key, name: x.name, weight: x.valueUsd, price: priceOf(x) }));
          })();
      const buys = split(usd * (1 - s.feePct / 100), destParts);

      const done = log.filter((e) => e.moveId === m.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const lastDone = done?.date ?? null;
      const due = lastDone ? new Date(`${lastDone}T00:00:00Z`).getTime() + m.everyDays * DAY : now;
      return {
        move: m,
        eligibleUsd,
        baseUsd,
        mult,
        reasons,
        usd,
        skipped,
        signal: sig,
        agreement: m.tilt ? r.agreement : 0,
        sells,
        buys,
        lastDone,
        dueOn: isoDay(Math.max(due, 0)),
        dueInDays: Math.ceil((due - now) / DAY),
      };
    });
}

/* ------------------------------------------------------------------ what the rates add up to */

/** Allocation the moves settle at if prices never moved (repeat the moves until nothing changes) */
export function steadyState(moves: Move[]): Record<Bucket, number> | null {
  const on = moves.filter((m) => m.on && m.ratePct > 0);
  if (!on.length) return null;
  let w: Record<Bucket, number> = { cash: 1 / 3, tokens: 1 / 3, sov: 1 / 3 };
  for (let i = 0; i < 20000; i++) {
    const next = { ...w };
    for (const m of on) {
      const f = (m.ratePct / 100) * (30 / m.everyDays);
      const amt = w[m.from] * f;
      next[m.from] -= amt;
      next[m.to] += amt;
    }
    const diff = Math.abs(next.cash - w.cash) + Math.abs(next.tokens - w.tokens) + Math.abs(next.sov - w.sov);
    w = next;
    if (diff < 1e-12) break;
  }
  return w;
}

/** Months for half of a gap to the steady state to close (prices flat) */
export function halfLifeMonths(moves: Move[]): number | null {
  const ss = steadyState(moves);
  if (!ss) return null;
  let w: Record<Bucket, number> = { cash: 1, tokens: 0, sov: 0 };
  const gap0 = Math.abs(w.cash - ss.cash) + Math.abs(w.tokens - ss.tokens) + Math.abs(w.sov - ss.sov);
  const on = moves.filter((m) => m.on && m.ratePct > 0);
  for (let mth = 1; mth <= 600; mth++) {
    const next = { ...w };
    for (const m of on) {
      const amt = w[m.from] * (m.ratePct / 100) * (30 / m.everyDays);
      next[m.from] -= amt;
      next[m.to] += amt;
    }
    w = next;
    const gap = Math.abs(w.cash - ss.cash) + Math.abs(w.tokens - ss.tokens) + Math.abs(w.sov - ss.sov);
    if (gap <= gap0 / 2) return mth;
  }
  return null;
}

/** Month-by-month allocation from today's dollars, prices flat */
export function project(start: Record<Bucket, number>, moves: Move[], months: number): { m: number; cash: number; tokens: number; sov: number }[] {
  const on = moves.filter((m) => m.on && m.ratePct > 0);
  let w = { ...start };
  const out = [{ m: 0, ...w }];
  for (let i = 1; i <= months; i++) {
    const next = { ...w };
    for (const m of on) {
      const amt = w[m.from] * (m.ratePct / 100) * (30 / m.everyDays);
      next[m.from] -= amt;
      next[m.to] += amt;
    }
    w = next;
    out.push({ m: i, ...w });
  }
  return out;
}

/* ------------------------------------------------------------------ backtest */

export interface PriceSeries {
  /** yyyy-mm-dd -> USD */
  [day: string]: number;
}

export interface BacktestInput {
  days: string[]; // sorted
  /** basket price per section on each day: index 1 at the start */
  sov: number[];
  tokens: number[];
  btc: number[];
  hiveBtc: number[]; // HIVE/BTC ratio, for the alt indicator
  fng: (number | null)[];
}

export type Strategy = 'hold' | 'cycle' | 'signals' | 'rebalance';
export const STRATEGY_LABEL: Record<Strategy, string> = {
  hold: 'Buy and hold (no moves)',
  cycle: 'Your cycle (fixed %)',
  signals: 'Your cycle + signals + targets',
  rebalance: 'Rebalance to targets every 30 days',
};

export interface BacktestResult {
  strategy: Strategy;
  values: number[];
  final: number;
  maxDrawdownPct: number;
  trades: number;
  feesUsd: number;
}

/** Runs one strategy over the price history. Moves happen on day 0 and then every `everyDays` of each move.
 * Indicators available in the past: fear & greed, Bitcoin vs 200-day average, distance from the high so
 * far, HIVE/BTC vs 90-day (funding and stock fear & greed have no long free history, so they're left out). */
export function backtest(inp: BacktestInput, startW: Record<Bucket, number>, s: Settings, strategy: Strategy, startUsd = 10_000): BacktestResult {
  const n = inp.days.length;
  const units = { cash: startUsd * startW.cash, tokens: (startUsd * startW.tokens) / inp.tokens[0]!, sov: (startUsd * startW.sov) / inp.sov[0]! };
  const value = (i: number) => units.cash + units.tokens * inp.tokens[i]! + units.sov * inp.sov[i]!;
  const dailyCash = Math.pow(1 + s.cashAprPct / 100, 1 / 365);
  const values: number[] = [];
  let peak = 0;
  let maxDd = 0;
  let trades = 0;
  let fees = 0;
  const lastRun: Record<string, number> = {};
  let btcHigh = 0;
  const t = normTargets(s.targets);
  const price = (b: Bucket, i: number) => (b === 'cash' ? 1 : b === 'tokens' ? inp.tokens[i]! : inp.sov[i]!);
  const transfer = (from: Bucket, to: Bucket, usd: number, i: number) => {
    const have = from === 'cash' ? units.cash : units[from] * price(from, i);
    usd = Math.min(usd, have);
    if (!(usd > 0)) return;
    const fee = (usd * s.feePct) / 100;
    if (from === 'cash') units.cash -= usd;
    else units[from] -= usd / price(from, i);
    if (to === 'cash') units.cash += usd - fee;
    else units[to] += (usd - fee) / price(to, i);
    trades++;
    fees += fee;
  };
  for (let i = 0; i < n; i++) {
    if (i > 0) units.cash *= dailyCash;
    btcHigh = Math.max(btcHigh, inp.btc[i]!);
    const v = value(i);
    if (strategy === 'rebalance' && (i === 0 || i - (lastRun.reb ?? 0) >= 30)) {
      lastRun.reb = i;
      const want = { cash: v * t.cash, tokens: v * t.tokens, sov: v * t.sov };
      const have = { cash: units.cash, tokens: units.tokens * inp.tokens[i]!, sov: units.sov * inp.sov[i]! };
      const over = BUCKETS.filter((b) => have[b] > want[b]);
      const under = BUCKETS.filter((b) => have[b] < want[b]);
      for (const o of over)
        for (const u of under) {
          const amt = Math.min(have[o] - want[o], want[u] - have[u]);
          if (amt > s.minTradeUsd) {
            transfer(o, u, amt, i);
            have[o] -= amt;
            have[u] += amt;
          }
        }
    } else if (strategy === 'cycle' || strategy === 'signals') {
      let inds: Indicator[] = [];
      if (strategy === 'signals') {
        const from = Math.max(0, i - 199);
        const avg200 = i >= 150 ? inp.btc.slice(from, i + 1).reduce((a, b) => a + b, 0) / (i + 1 - from) : null;
        const from90 = Math.max(0, i - 89);
        const avg90 = i >= 60 ? inp.hiveBtc.slice(from90, i + 1).reduce((a, b) => a + b, 0) / (i + 1 - from90) : null;
        inds = indicators({
          fng: inp.fng[i],
          mayer: avg200 ? inp.btc[i]! / avg200 : null,
          drawdownPct: i >= 150 ? (inp.btc[i]! / btcHigh - 1) * 100 : null,
          altVs90: avg90 ? inp.hiveBtc[i]! / avg90 - 1 : null,
        });
      }
      const ss: Settings = strategy === 'signals' ? s : { ...s, useTargets: false, tiltStrength: 0 };
      const have = { cash: units.cash, tokens: units.tokens * inp.tokens[i]!, sov: units.sov * inp.sov[i]! };
      const w = { cash: have.cash / v, tokens: have.tokens / v, sov: have.sov / v };
      const r = riskScore(inds, ss.weights);
      const alt = inds.find((x) => x.key === 'alt');
      for (const m of ss.moves) {
        if (!m.on || m.ratePct <= 0) continue;
        const lr = lastRun[m.id];
        if (lr !== undefined && i - lr < m.everyDays) continue;
        lastRun[m.id] = i;
        let mult = 1;
        if (strategy === 'signals') {
          if (m.tilt && ss.tiltStrength > 0) mult *= clamp(1 + ss.tiltStrength * moveSignal(m, r.score, alt ? alt.score : null, ss), 0, ss.maxMult);
          mult *= driftMult(m, w, ss);
          mult = clamp(mult, 0, ss.maxMult);
        }
        const usd = have[m.from] * (m.ratePct / 100) * mult;
        if (usd >= ss.minTradeUsd) transfer(m.from, m.to, usd, i);
      }
    }
    const after = value(i);
    values.push(after);
    peak = Math.max(peak, after);
    maxDd = Math.min(maxDd, (after / peak - 1) * 100);
  }
  return { strategy, values, final: values[n - 1] ?? startUsd, maxDrawdownPct: maxDd, trades, feesUsd: fees };
}

/** Builds the basket price lines from coin series: each section = its holdings' current mix (by value) */
export function basket(days: string[], series: Record<string, PriceSeries>, mix: Record<string, number>): number[] | null {
  const keys = Object.keys(mix).filter((k) => series[k] && mix[k]! > 0);
  if (!keys.length) return null;
  const tw = keys.reduce((s, k) => s + mix[k]!, 0);
  const first: Record<string, number> = {};
  const last: Record<string, number> = {};
  for (const k of keys) first[k] = series[k]![days[0]!] ?? NaN;
  if (keys.some((k) => !Number.isFinite(first[k]))) return null;
  return days.map((d) => {
    let v = 0;
    for (const k of keys) {
      const p = series[k]![d] ?? last[k] ?? first[k]!;
      last[k] = p;
      v += (mix[k]! / tw) * (p / first[k]!);
    }
    return v;
  });
}
