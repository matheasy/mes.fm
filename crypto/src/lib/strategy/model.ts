/**
 * mes.fm/strategy - the rules engine behind the page. Pure (no fetch, no React).
 *
 * The user's own rotation, as a dated to-do list:
 *  - every 30 days ~4% of Cash LP goes to Tokens and/or Liquidity (the PancakeSwap ETH/BNB position)
 *  - every 30 days the Liquidity position's profit (value above what was put in) goes to Store of Value
 *  - every 30 days ~3% of Tokens goes to Store of Value
 *  - every 30 days ~2% of Store of Value goes back to Cash LP
 * Store of Value = big coins expected to last many years, kept LEVEL with each other: buys go to the
 * smallest, sells come from the biggest (BTC catches up with XRP; then Gold / Monero join).
 *
 * Two optional nudges change a move's size: market signals (fear & greed, Bitcoin vs its 200-day
 * average ...) and target weights. Every number comes with the reasons that produced it, plus plain
 * warnings. It is a rules calculator, not a forecast.
 */

export type Bucket = 'cash' | 'lp' | 'tokens' | 'sov';
export const BUCKETS: Bucket[] = ['cash', 'lp', 'tokens', 'sov'];
export const BUCKET_LABEL: Record<Bucket, string> = { cash: 'Cash LP', lp: 'Liquidity', tokens: 'Tokens', sov: 'Store of Value' };
export const BUCKET_LINK: Record<Bucket, string> = { cash: 'https://mes.fm/cash', lp: 'https://mes.fm/lp', tokens: 'https://mes.fm/tokens', sov: 'https://mes.fm/sov' };
/** How "risky" a section is, for the direction of the signal nudge: buying riskier = adding risk */
const RISK: Record<Bucket, number> = { cash: 0, sov: 1, lp: 2, tokens: 2 };
const isB = (b: unknown): b is Bucket => b === 'cash' || b === 'lp' || b === 'tokens' || b === 'sov';

export interface Move {
  id: string;
  /** pct = a % of the section; profit = whatever the section is worth above what was put in */
  kind: 'pct' | 'profit';
  from: Bucket;
  to: Bucket;
  /** optional second destination: `pct`% of the amount goes there instead */
  split: { to: Bucket; pct: number } | null;
  /** % of the eligible part of `from` moved each time (pct moves) */
  ratePct: number;
  everyDays: number;
  /** let the market signals change the size */
  tilt: boolean;
  on: boolean;
}

export type IndicatorKey = 'fng' | 'mayer' | 'drawdown' | 'funding' | 'stockfg' | 'alt';

export interface Settings {
  v: 2;
  moves: Move[];
  /** a holding must be worth at least this to be sold from (and to be a default place to buy) */
  minHoldingUsd: number;
  /** a move smaller than this is skipped (fees eat it) */
  minTradeUsd: number;
  /** what went into the Liquidity position, in CAD (moves into Liquidity logged here are added on top) */
  lpBasisCad: number;
  /** Store of Value: buy the smallest coin / sell the biggest, so they level out over time */
  sovLevel: boolean;
  /** Store of Value sales: spread over every coin worth minHoldingUsd+ (default), or the biggest first */
  sovSell: 'spread' | 'biggest';
  /** coins to add to Store of Value once the current ones are level (shown as a reminder) */
  sovNext: string;
  /** target weights in % (rescaled to add to 100) */
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

export const DEFAULT_NODES: Settings['diagram']['nodes'] = { cash: { x: 16, y: 50 }, tokens: { x: 50, y: 17 }, lp: { x: 50, y: 83 }, sov: { x: 84, y: 50 } };

export const DEFAULT_MOVES: Move[] = [
  { id: 'c2t', kind: 'pct', from: 'cash', to: 'tokens', split: { to: 'lp', pct: 50 }, ratePct: 4, everyDays: 30, tilt: true, on: true },
  { id: 'lp2s', kind: 'profit', from: 'lp', to: 'sov', split: null, ratePct: 100, everyDays: 30, tilt: false, on: true },
  { id: 't2s', kind: 'pct', from: 'tokens', to: 'sov', split: null, ratePct: 3, everyDays: 30, tilt: true, on: true },
  { id: 's2c', kind: 'pct', from: 'sov', to: 'cash', split: null, ratePct: 2, everyDays: 30, tilt: true, on: true },
];

export const DEFAULT_SETTINGS: Settings = {
  v: 2,
  moves: DEFAULT_MOVES,
  minHoldingUsd: 500,
  minTradeUsd: 20,
  lpBasisCad: 4777.13,
  sovLevel: true,
  sovSell: 'spread',
  sovNext: 'Gold (PAXG), Monero (XMR)',
  targets: { cash: 15, lp: 15, tokens: 15, sov: 55 },
  useTargets: false,
  driftWeight: 0.5,
  tiltStrength: 0.5,
  maxMult: 2,
  weights: { fng: 1, mayer: 1, drawdown: 0.5, funding: 0.5, stockfg: 0.25, alt: 1 },
  dest: { cash: { HBD: 100 }, lp: {}, tokens: {}, sov: {} },
  keep: ['TGLD', 'SURGE', 'ACE', 'BTC/HBD pool'],
  feePct: 0.3,
  cashAprPct: 15,
  diagram: { nodes: DEFAULT_NODES, labels: {} },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);

/** Fills in anything missing or out of range (old saves, hand-edited JSON) */
export function normalize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings> & { v?: number };
  const d = DEFAULT_SETTINGS;
  const old = r.v !== 2; // v1 had no Liquidity section: start from the new default moves
  const moves: Move[] =
    !old && Array.isArray(r.moves)
      ? r.moves
          .filter((m) => m && isB(m.from) && isB(m.to) && m.from !== m.to)
          .slice(0, 10)
          .map((m, i) => ({
            id: typeof m.id === 'string' && m.id ? m.id.slice(0, 20) : `m${i}`,
            kind: m.kind === 'profit' ? ('profit' as const) : ('pct' as const),
            from: m.from,
            to: m.to,
            split: m.split && isB(m.split.to) && m.split.to !== m.from && m.split.to !== m.to ? { to: m.split.to, pct: num(m.split.pct, 50, 0, 100) } : null,
            ratePct: num(m.ratePct, 2, 0, 100),
            everyDays: Math.round(num(m.everyDays, 30, 1, 365)),
            tilt: m.tilt !== false && m.kind !== 'profit',
            on: m.on !== false,
          }))
      : d.moves.map((m) => ({ ...m, split: m.split ? { ...m.split } : null }));
  const t = (r.targets ?? {}) as Partial<Record<Bucket, number>>;
  const w = (r.weights ?? {}) as Partial<Record<IndicatorKey, number>>;
  const dest = (r.dest ?? {}) as Partial<Record<Bucket, Record<string, number>>>;
  const cleanDest = (o: unknown) => {
    const out: Record<string, number> = {};
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (k && typeof v === 'number' && v >= 0) out[k.slice(0, 30)] = clamp(v, 0, 1000);
    return out;
  };
  const dg = (r.diagram ?? {}) as Partial<Settings['diagram']>;
  const nodes = { ...DEFAULT_NODES };
  if (!old)
    for (const b of BUCKETS) {
      const n = dg.nodes?.[b];
      if (n) nodes[b] = { x: num(n.x, nodes[b].x, 5, 95), y: num(n.y, nodes[b].y, 8, 92) };
    }
  const labels: Settings['diagram']['labels'] = {};
  if (!old && dg.labels && typeof dg.labels === 'object')
    for (const [k, v] of Object.entries(dg.labels)) if (v) labels[k.slice(0, 30)] = { dx: num(v.dx, 0, -400, 400), dy: num(v.dy, 0, -400, 400) };
  return {
    v: 2,
    moves,
    minHoldingUsd: num(r.minHoldingUsd, d.minHoldingUsd, 0, 1e7),
    minTradeUsd: num(r.minTradeUsd, d.minTradeUsd, 0, 1e6),
    lpBasisCad: num(r.lpBasisCad, d.lpBasisCad, 0, 1e9),
    sovLevel: r.sovLevel ?? d.sovLevel,
    sovSell: r.sovSell === 'biggest' ? 'biggest' : 'spread',
    sovNext: typeof r.sovNext === 'string' ? r.sovNext.slice(0, 120) : d.sovNext,
    targets: Object.fromEntries(BUCKETS.map((b) => [b, old ? d.targets[b] : num(t[b], d.targets[b], 0, 100)])) as Record<Bucket, number>,
    useTargets: r.useTargets ?? d.useTargets,
    driftWeight: num(r.driftWeight, d.driftWeight, 0, 1),
    tiltStrength: num(r.tiltStrength, d.tiltStrength, 0, 1),
    maxMult: num(r.maxMult, d.maxMult, 1, 5),
    weights: Object.fromEntries((Object.keys(d.weights) as IndicatorKey[]).map((k) => [k, num(w[k], d.weights[k], 0, 3)])) as Settings['weights'],
    dest: { cash: cleanDest(dest.cash ?? d.dest.cash), lp: cleanDest(dest.lp), tokens: cleanDest(dest.tokens), sov: cleanDest(dest.sov) },
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

type In = { key: string; name: string; valueUsd: number; amount: number | null }[];

export function holdingsFrom(parts: Record<Bucket, In>): Holdings {
  const items: Holding[] = BUCKETS.flatMap((b) => parts[b].map((h) => ({ ...h, bucket: b })));
  const total = { cash: 0, lp: 0, tokens: 0, sov: 0 };
  for (const h of items) total[h.bucket] += h.valueUsd;
  return { items, total, all: total.cash + total.lp + total.tokens + total.sov };
}

export function weightsOf(h: Holdings): Record<Bucket, number> {
  const a = h.all || 1;
  return { cash: h.total.cash / a, lp: h.total.lp / a, tokens: h.total.tokens / a, sov: h.total.sov / a };
}

export function normTargets(t: Record<Bucket, number>): Record<Bucket, number> {
  const s = BUCKETS.reduce((x, b) => x + t[b], 0);
  if (!(s > 0)) return { cash: 0.25, lp: 0.25, tokens: 0.25, sov: 0.25 };
  return { cash: t.cash / s, lp: t.lp / s, tokens: t.tokens / s, sov: t.sov / s };
}

/* ------------------------------------------------------------------ indicators */

export interface Indicator {
  key: IndicatorKey;
  name: string;
  value: string;
  /** -1..+1, + = "cheap / fearful" (adding risk is favoured); for `alt`: + = tokens strong vs Bitcoin */
  score: number;
  /** one line in plain words: what this reading means right now */
  plain: string;
  note: string;
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

const mood = (s: number) => (s >= 0.6 ? 'very cheap / fearful' : s >= 0.2 ? 'cheapish / fearful' : s > -0.2 ? 'normal' : s > -0.6 ? 'pricey / greedy' : 'very pricey / greedy');

export function indicators(m: MarketInputs): Indicator[] {
  const out: Indicator[] = [];
  const pct = (v: number, d = 0) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}%`;
  if (m.fng != null) {
    const s = SCORE.fng(m.fng);
    out.push({ key: 'fng', name: 'Crypto Fear & Greed', value: `${Math.round(m.fng)} / 100`, score: s, plain: `Crypto traders are ${m.fng < 25 ? 'very scared' : m.fng < 45 ? 'nervous' : m.fng <= 55 ? 'calm' : m.fng <= 75 ? 'greedy' : 'very greedy'}.`, note: 'A daily survey of volatility, volume, social media and Bitcoin dominance. Under 25 = extreme fear, over 75 = extreme greed.' });
  }
  if (m.mayer != null) {
    const s = SCORE.mayer(m.mayer);
    out.push({ key: 'mayer', name: 'Bitcoin vs its 200-day average', value: `${m.mayer.toFixed(2)}×`, score: s, plain: m.mayer < 1 ? 'Bitcoin is below its long-term average price: on sale compared with the last ~7 months.' : m.mayer > 1.8 ? 'Bitcoin is far above its long-term average: stretched.' : 'Bitcoin is near or a bit above its long-term average.', note: 'Price ÷ average of the last 200 days. Under 1 = below trend, over ~1.8 = stretched. Counted as neutral at 1.1.' });
  }
  if (m.drawdownPct != null) {
    const s = SCORE.drawdown(m.drawdownPct);
    out.push({ key: 'drawdown', name: 'Bitcoin below its all-time high', value: pct(m.drawdownPct), score: s, plain: `Bitcoin is ${Math.round(-m.drawdownPct)}% below its record price.`, note: 'Deep drops (-50% and more) have historically been good buying zones; near the record, much less so. Neutral at -25%.' });
  }
  if (m.fundingApr != null) {
    const s = SCORE.funding(m.fundingApr);
    out.push({ key: 'funding', name: 'Bitcoin perp funding', value: `${m.fundingApr.toFixed(1)}% a year`, score: s, plain: m.fundingApr > 25 ? 'Leveraged traders are piling into longs: crowded, risk of a flush down.' : m.fundingApr < 0 ? 'Leveraged traders are betting on falls: often near a bottom.' : 'Leveraged traders are not unusually one-sided.', note: 'What leveraged long traders pay short traders. High = crowded longs, negative = crowded shorts. Normal ~10%.' });
  }
  if (m.stockFg != null) {
    const s = SCORE.stockfg(m.stockFg);
    out.push({ key: 'stockfg', name: 'Stock Fear & Greed (MES)', value: `${Math.round(m.stockFg)} / 100`, score: s, plain: `Stock markets are ${m.stockFg < 25 ? 'very scared' : m.stockFg < 45 ? 'nervous' : m.stockFg <= 55 ? 'calm' : 'greedy'}.`, note: 'MES\'s own mix of S&P 500 momentum, the VIX and junk-bond spreads. Crypto usually moves with stocks. Small weight by default.' });
  }
  if (m.altVs90 != null) {
    const s = SCORE.alt(m.altVs90);
    out.push({ key: 'alt', name: 'HIVE vs Bitcoin (90-day)', value: pct(m.altVs90 * 100, 1), score: s, plain: m.altVs90 > 0.05 ? 'HIVE has been beating Bitcoin lately: a good time to trim tokens into Store of Value.' : m.altVs90 < -0.05 ? 'HIVE has been lagging Bitcoin lately: trimming tokens now sells the weak one.' : 'HIVE and Bitcoin have moved about the same lately.', note: 'HIVE priced in BTC, compared with its 90-day average. Only used for the Tokens → Store of Value move.' });
  }
  return out;
}

export interface Risk {
  /** -1 greedy .. +1 fearful */
  score: number;
  agreement: number;
  /** how many risk signals point the same way as the score, out of `used` */
  agreeCount: number;
  used: number;
}

/** The combined "add risk" score -1..+1 and how much the risk indicators agree with its sign */
export function riskScore(inds: Indicator[], w: Settings['weights']): Risk {
  const risk = inds.filter((i) => i.key !== 'alt' && (w[i.key] ?? 0) > 0);
  const tw = risk.reduce((s, i) => s + w[i.key], 0);
  if (!tw) return { score: 0, agreement: 0, agreeCount: 0, used: 0 };
  const score = risk.reduce((s, i) => s + w[i.key] * i.score, 0) / tw;
  const sign = Math.sign(score);
  const agreeing = sign === 0 ? [] : risk.filter((i) => Math.sign(i.score) === sign && Math.abs(i.score) > 0.1);
  return { score, agreement: agreeing.reduce((s, i) => s + w[i.key], 0) / tw, agreeCount: agreeing.length, used: risk.length };
}

export function stanceOf(score: number): { label: string; plain: string; tone: 'buy' | 'sell' | 'neutral' } {
  if (score >= 0.6) return { label: 'Very fearful market', plain: 'Prices are low and people are scared. Historically a better time to buy than to sell, so the plan buys a bit more and sells a bit less.', tone: 'buy' };
  if (score >= 0.2) return { label: 'Fearful market', plain: 'People are nervous and prices are lowish. The plan buys slightly more and sells slightly less.', tone: 'buy' };
  if (score > -0.2) return { label: 'Normal market', plain: 'Nothing unusual. The plan runs at its normal sizes.', tone: 'neutral' };
  if (score > -0.6) return { label: 'Greedy market', plain: 'Prices are up and people are excited. The plan buys slightly less and takes slightly more profit.', tone: 'sell' };
  return { label: 'Very greedy market', plain: 'Euphoria. Historically a better time to take profits than to buy, so the plan slows buying and sells more.', tone: 'sell' };
}

/* ------------------------------------------------------------------ the plan */

export interface Reason {
  label: string;
  mult: number;
  why: string;
}

export interface Leg {
  key: string;
  name: string;
  usd: number;
  /** amount of the coin, when its price is known */
  amount: number | null;
  /** which section it goes to (buys of a split move) */
  bucket?: Bucket;
}

export interface Note {
  tone: 'warn' | 'tip' | 'info';
  text: string;
}

export interface PlannedMove {
  move: Move;
  eligibleUsd: number;
  baseUsd: number;
  mult: number;
  reasons: Reason[];
  usd: number;
  skipped: string | null;
  /** -1..1 signal for this move's direction */
  signal: number;
  sells: Leg[];
  buys: Leg[];
  notes: Note[];
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
  /** USD -> CAD rate on the day (to grow the Liquidity cost in CAD) */
  cad?: number;
  /** part that went to Liquidity (split moves), USD */
  lpUsd?: number;
  note?: string;
  skipped?: boolean;
}

export interface LpInfo {
  valueUsd: number;
  cadRate: number | null;
  /** in range = earning fees */
  inRange: boolean | null;
  legs: { symbol: string; valueUsd: number; amount: number }[];
}

export interface LpStatus {
  basisCad: number;
  valueCad: number | null;
  profitCad: number | null;
  profitUsd: number | null;
  profitPct: number | null;
}

const DAY = 86_400_000;
export const isoDay = (t: number | Date) => new Date(t).toISOString().slice(0, 10);

/** What went into Liquidity (CAD): the starting amount + every logged move into it, at that day's rate */
export function lpStatus(s: Settings, log: LogEntry[], lp: LpInfo | null): LpStatus {
  let basis = s.lpBasisCad;
  for (const e of log) {
    if (e.skipped) continue;
    const toLp = e.to === 'lp' ? e.usd : (e.lpUsd ?? 0);
    const rate = e.cad ?? lp?.cadRate ?? 1.4;
    if (toLp > 0) basis += toLp * rate;
    if (e.from === 'lp' && e.moveId !== 'lp2s') basis -= e.usd * rate; // a % taken out of the position
  }
  if (!lp || !lp.cadRate) return { basisCad: basis, valueCad: null, profitCad: null, profitUsd: null, profitPct: null };
  const valueCad = lp.valueUsd * lp.cadRate;
  const profitCad = valueCad - basis;
  return { basisCad: basis, valueCad, profitCad, profitUsd: profitCad / lp.cadRate, profitPct: basis > 0 ? profitCad / basis : null };
}

/** Signal for a move: buying a riskier section follows the risk score, selling one follows it backwards;
 * Tokens <-> Store of Value also follows the HIVE/BTC trend. */
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

/** The plain-words reason for the signal nudge */
export function signalWhy(move: Move, risk: number, alt: number | null, mult: number): string {
  const chg = Math.round((mult - 1) * 100);
  const size = chg === 0 ? 'its normal size' : `${Math.abs(chg)}% ${chg > 0 ? 'bigger' : 'smaller'} than normal`;
  const buying = RISK[move.to] > RISK[move.from];
  const fear = risk >= 0.2;
  const greed = risk <= -0.2;
  const tokensOut = move.from === 'tokens' && move.to === 'sov';
  if (tokensOut && alt != null && Math.abs(alt) > 0.2) {
    return alt > 0
      ? `HIVE has been beating Bitcoin, so it is a good moment to trim tokens into Store of Value: ${size}.`
      : `HIVE has been lagging Bitcoin, so selling tokens now sells the weak one cheap: ${size}.`;
  }
  if (buying) {
    if (fear) return `Prices are low and people are scared, which has usually been a good time to buy: ${size}.`;
    if (greed) return `Prices are high and people are greedy, which has usually been a worse time to buy: ${size}.`;
    return `The market is normal: ${size}.`;
  }
  if (fear) return `Prices are low and people are scared. Selling into that is selling low, so this sale is ${size}.`;
  if (greed) return `Prices are high and people are greedy: a good time to take money off the table, so ${size}.`;
  return `The market is normal: ${size}.`;
}

export function driftMult(move: Move, w: Record<Bucket, number>, s: Settings): number {
  if (!s.useTargets || s.driftWeight <= 0) return 1;
  const t = normTargets(s.targets);
  const dev = (b: Bucket) => (t[b] > 0 ? clamp((w[b] - t[b]) / t[b], -1, 1) : w[b] > 0 ? 1 : 0);
  return clamp(1 + s.driftWeight * (dev(move.from) - dev(move.to)), 0, s.maxMult);
}

type Part = { key: string; name: string; weight: number; price: number | null; value: number; bucket?: Bucket };

function split(total: number, parts: Part[]): Leg[] {
  const tw = parts.reduce((s, p) => s + p.weight, 0);
  if (!(tw > 0) || !(total > 0)) return [];
  return parts
    .filter((p) => p.weight > 0)
    .map((p) => {
      const usd = (total * p.weight) / tw;
      return { key: p.key, name: p.name, usd, amount: p.price ? usd / p.price : null, bucket: p.bucket };
    })
    .sort((a, b) => b.usd - a.usd);
}

/** Levelling: buys fill the smallest coins first (water-filling), sells take from the biggest first */
export function levelBuy(total: number, parts: Part[]): Leg[] {
  if (!(total > 0) || !parts.length) return [];
  const vals = parts.map((p) => p.value);
  const sorted = [...vals].sort((a, b) => a - b);
  // find the water level L: sum(max(0, L - v)) = total
  let level = sorted[0]!;
  let left = total;
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1]! : Infinity;
    const need = (next - level) * (i + 1);
    if (need >= left) {
      level += left / (i + 1);
      left = 0;
      break;
    }
    left -= need;
    level = next;
  }
  return parts
    .map((p) => {
      const usd = Math.max(0, level - p.value);
      return { key: p.key, name: p.name, usd, amount: p.price ? usd / p.price : null, bucket: p.bucket };
    })
    .filter((l) => l.usd > 0.005)
    .sort((a, b) => b.usd - a.usd);
}

export function levelSell(total: number, parts: Part[]): Leg[] {
  if (!(total > 0) || !parts.length) return [];
  const cap = parts.reduce((s, p) => s + p.value, 0);
  total = Math.min(total, cap);
  const sorted = parts.map((p) => p.value).sort((a, b) => b - a);
  let level = sorted[0]!;
  let left = total;
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1]! : 0;
    const give = (level - next) * (i + 1);
    if (give >= left) {
      level -= left / (i + 1);
      left = 0;
      break;
    }
    left -= give;
    level = next;
  }
  return parts
    .map((p) => {
      const usd = Math.max(0, p.value - level);
      return { key: p.key, name: p.name, usd, amount: p.price ? usd / p.price : null };
    })
    .filter((l) => l.usd > 0.005)
    .sort((a, b) => b.usd - a.usd);
}

export interface PlanCtx {
  lp: LpInfo | null;
  now?: number;
}

export function plan(h: Holdings, s: Settings, inds: Indicator[], log: LogEntry[], ctx: PlanCtx): PlannedMove[] {
  const now = ctx.now ?? Date.now();
  const w = weightsOf(h);
  const r = riskScore(inds, s.weights);
  const altInd = inds.find((i) => i.key === 'alt');
  const alt = altInd ? altInd.score : null;
  const keep = new Set(s.keep.map((k) => k.toUpperCase()));
  const priceOf = (x: Holding) => (x.amount && x.amount > 0 ? x.valueUsd / x.amount : null);
  const lps = lpStatus(s, log, ctx.lp);

  const destParts = (b: Bucket): Part[] => {
    if (b === 'lp' && ctx.lp) return ctx.lp.legs.map((l) => ({ key: l.symbol, name: `${l.symbol} into the LP`, weight: l.valueUsd, price: l.amount > 0 ? l.valueUsd / l.amount : null, value: l.valueUsd, bucket: 'lp' as const }));
    const cfg = s.dest[b] ?? {};
    const held = h.items.filter((x) => x.bucket === b && !keep.has(x.key.toUpperCase()) && x.amount !== null);
    if (Object.keys(cfg).length)
      return Object.entries(cfg).map(([k, wt]) => {
        const hh = h.items.find((x) => x.bucket === b && x.key.toUpperCase() === k.toUpperCase());
        return { key: k, name: hh?.name ?? k, weight: wt, price: hh ? priceOf(hh) : null, value: hh?.valueUsd ?? 0, bucket: b };
      });
    if (b === 'sov' && s.sovLevel) return held.map((x) => ({ key: x.key, name: x.name, weight: 1, price: priceOf(x), value: x.valueUsd, bucket: b }));
    const big = held.filter((x) => x.valueUsd >= s.minHoldingUsd);
    return (big.length ? big : held.slice(0, 3)).map((x) => ({ key: x.key, name: x.name, weight: x.valueUsd, price: priceOf(x), value: x.valueUsd, bucket: b }));
  };
  const buyInto = (b: Bucket, usd: number) => (b === 'sov' && s.sovLevel ? levelBuy(usd, destParts(b)) : split(usd, destParts(b)));

  return s.moves
    .filter((m) => m.on)
    .map((m) => {
      const reasons: Reason[] = [];
      let src: Holding[];
      let eligibleUsd: number;
      let baseUsd: number;
      if (m.kind === 'profit') {
        src = h.items.filter((x) => x.bucket === m.from);
        eligibleUsd = h.total[m.from];
        baseUsd = m.from === 'lp' ? Math.max(0, lps.profitUsd ?? 0) : 0;
      } else {
        src = h.items.filter((x) => x.bucket === m.from && x.valueUsd >= s.minHoldingUsd && !keep.has(x.key.toUpperCase()));
        eligibleUsd = src.reduce((t, x) => t + x.valueUsd, 0);
        baseUsd = (eligibleUsd * m.ratePct) / 100;
      }
      const sig = m.tilt ? moveSignal(m, r.score, alt, s) : 0;
      let mult = 1;
      if (m.tilt && s.tiltStrength > 0) {
        const t = clamp(1 + s.tiltStrength * sig, 0, s.maxMult);
        reasons.push({ label: 'Market mood', mult: t, why: signalWhy(m, r.score, alt, t) });
        mult *= t;
      }
      if (m.kind === 'pct' && s.useTargets && s.driftWeight > 0) {
        const dm = driftMult(m, w, s);
        reasons.push({ label: 'Your targets', mult: dm, why: dm > 1.01 ? `${BUCKET_LABEL[m.from]} is above its target (or ${BUCKET_LABEL[m.to]} below), so move more.` : dm < 0.99 ? `${BUCKET_LABEL[m.from]} is below its target (or ${BUCKET_LABEL[m.to]} above), so move less.` : 'On target.' });
        mult *= dm;
      }
      mult = clamp(mult, 0, s.maxMult);
      let usd = baseUsd * mult;
      let skipped: string | null = null;
      if (m.kind === 'profit') {
        if (m.from === 'lp' && lps.profitUsd == null) skipped = 'The Liquidity value has not loaded';
        else if (baseUsd <= 0) skipped = `No profit to move: the position is ${lps.profitCad != null ? `${fmtCad(-lps.profitCad)} below` : 'below'} what you put in`;
        else if (usd < s.minTradeUsd) skipped = `The profit (${fmtUsd(usd)}) is under the $${s.minTradeUsd} minimum, let it grow`;
      } else if (!src.length) skipped = `Nothing in ${BUCKET_LABEL[m.from]} is worth $${s.minHoldingUsd.toLocaleString()} or more`;
      else if (mult === 0) skipped = 'Market mood and targets both say wait this time';
      else if (usd < s.minTradeUsd) skipped = `Under the $${s.minTradeUsd} minimum trade`;
      if (skipped) usd = 0;

      const srcParts: Part[] =
        m.from === 'lp' && ctx.lp
          ? ctx.lp.legs.map((l) => ({ key: l.symbol, name: `${l.symbol} out of the LP`, weight: l.valueUsd, price: l.amount > 0 ? l.valueUsd / l.amount : null, value: l.valueUsd }))
          : src.map((x) => ({ key: x.key, name: x.name, weight: x.valueUsd, price: priceOf(x), value: x.valueUsd }));
      const sells = m.from === 'sov' && s.sovSell === 'biggest' ? levelSell(usd, srcParts) : split(usd, srcParts);
      const net = usd * (1 - s.feePct / 100);
      const share2 = m.split ? m.split.pct / 100 : 0;
      const buys = [...buyInto(m.to, net * (1 - share2)), ...(m.split && share2 > 0 ? buyInto(m.split.to, net * share2) : [])];

      const done = log.filter((e) => e.moveId === m.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      const lastDone = done?.date ?? null;
      const due = lastDone ? new Date(`${lastDone}T00:00:00Z`).getTime() + m.everyDays * DAY : now;
      const p: PlannedMove = {
        move: m,
        eligibleUsd,
        baseUsd,
        mult,
        reasons,
        usd,
        skipped,
        signal: sig,
        sells,
        buys,
        notes: [],
        lastDone,
        dueOn: isoDay(Math.max(due, 0)),
        dueInDays: Math.ceil((due - now) / DAY),
      };
      p.notes = advise(p, { h, s, risk: r, alt, lp: ctx.lp, lps });
      return p;
    });
}

const fmtUsd = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fmtCad = (v: number) => `${v.toLocaleString('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 })} CAD`;

/** Plain warnings / tips for one move */
export function advise(p: PlannedMove, c: { h: Holdings; s: Settings; risk: Risk; alt: number | null; lp: LpInfo | null; lps: LpStatus }): Note[] {
  const n: Note[] = [];
  const m = p.move;
  const { h, s, risk } = c;
  const dests = [m.to, ...(m.split ? [m.split.to] : [])];
  const share = (b: Bucket) => {
    const list = h.items.filter((x) => x.bucket === b).sort((a, z) => z.valueUsd - a.valueUsd);
    return list[0] && h.total[b] > 0 ? { key: list[0].key, pct: list[0].valueUsd / h.total[b] } : null;
  };

  if (p.mult >= s.maxMult - 0.001 && p.mult > 1) n.push({ tone: 'info', text: `This move hit its cap (${s.maxMult}× the normal size).` });

  // buying into something
  if (dests.includes('lp')) {
    if (c.lp?.inRange === false) n.push({ tone: 'warn', text: 'The Liquidity position is OUT OF RANGE, so it earns no fees right now. Re-range it (or send this month\'s share to Tokens) before adding.' });
    if (c.lps.profitPct != null && c.lps.profitPct < -0.1) n.push({ tone: 'info', text: `Liquidity is ${Math.round(-c.lps.profitPct * 100)}% below what you put in. Adding now lowers your average cost, but only if you still expect ETH and BNB to recover.` });
    n.push({ tone: 'tip', text: 'Adding to the LP means buying ETH and BNB about half and half (by value) and adding both to the position. Record it with ✓ Done so the Liquidity cost goes up with it.' });
  }
  if (dests.includes('tokens')) {
    const t = share('tokens');
    if (t && t.pct > 0.75) n.push({ tone: 'warn', text: `${t.key} is already ${Math.round(t.pct * 100)}% of Tokens. Consider putting this month's token buy into another coin you like, or into Liquidity, to spread the risk.` });
  }
  if (m.to === 'sov' || m.split?.to === 'sov') {
    const sov = h.items.filter((x) => x.bucket === 'sov' && x.valueUsd > 0 && !s.keep.map((k) => k.toUpperCase()).includes(x.key.toUpperCase())).sort((a, z) => z.valueUsd - a.valueUsd);
    if (sov.length >= 2 && s.sovLevel) {
      const big = sov[0]!;
      const small = sov[sov.length - 1]!;
      const ratio = small.valueUsd / big.valueUsd;
      if (ratio >= 0.95) n.push({ tone: 'tip', text: `${small.key} has caught up with ${big.key}: Store of Value is level. Time to decide on the next coin (${s.sovNext}). Add it under Settings → Where bought value goes and it gets the buys until it catches up.` });
      else n.push({ tone: 'info', text: `Levelling: this goes to ${small.key} (${Math.round(ratio * 100)}% of ${big.key}'s size). Needs about ${fmtUsd(big.valueUsd - small.valueUsd)} more to be level.` });
    }
  }
  if (m.to === 'cash' && risk.score >= 0.6 && m.tilt) n.push({ tone: 'warn', text: 'The market is very fearful. Selling Store of Value for cash now is selling near the lows. "Skip this time" is a reasonable choice this month.' });
  if (m.from === 'sov' && p.sells.length > 1 && s.sovSell === 'spread') n.push({ tone: 'info', text: `Sold from every Store of Value coin worth $${s.minHoldingUsd}+ in proportion to its size (${p.sells.map((x) => x.key).join(', ')}). The Tokens → Store of Value buys go to the smallest coin, which is what levels them.` });
  if (m.from === 'sov' && s.sovSell === 'biggest' && p.sells.length) n.push({ tone: 'info', text: `Sells from the biggest Store of Value coin first (${p.sells.map((x) => x.key).join(', ')}), which also helps level them.` });
  if (m.from === 'tokens' && c.alt != null && c.alt < -0.2) n.push({ tone: 'info', text: 'HIVE is weak against Bitcoin right now. If HIVE is below what you paid, this sale also books a loss for taxes (fine, but don\'t buy it back within 30 days).' });
  if ((m.from === 'cash') && h.total.cash - p.usd < h.all * 0.05) n.push({ tone: 'warn', text: 'After this, Cash LP would be under 5% of everything: little left to buy the next dip with.' });
  if (m.kind === 'profit' && m.from === 'lp' && c.lps.profitCad != null) {
    n.push(
      c.lps.profitCad > 0
        ? { tone: 'tip', text: `Liquidity is ${fmtCad(c.lps.profitCad)} up on ${fmtCad(c.lps.basisCad)} put in. Taking this profit out leaves the original amount working. Harvest the CAKE rewards too (they count as income for taxes).` }
        : { tone: 'info', text: `Liquidity is ${fmtCad(-c.lps.profitCad)} below the ${fmtCad(c.lps.basisCad)} you put in: leave it, nothing to take out this month.` },
    );
  }
  if (p.usd > 0 && p.usd < 50) n.push({ tone: 'info', text: 'A small amount: fees can eat a noticeable part. Doing it every second month would be fine.' });
  return n;
}

/* ------------------------------------------------------------------ what the rates add up to */

function stepFlat(w: Record<Bucket, number>, moves: Move[]): Record<Bucket, number> {
  const next = { ...w };
  for (const m of moves) {
    if (!m.on || m.kind !== 'pct' || m.ratePct <= 0) continue;
    const amt = w[m.from] * (m.ratePct / 100) * (30 / m.everyDays);
    next[m.from] -= amt;
    const s2 = m.split ? m.split.pct / 100 : 0;
    next[m.to] += amt * (1 - s2);
    if (m.split) next[m.split.to] += amt * s2;
  }
  return next;
}
const gapOf = (a: Record<Bucket, number>, b: Record<Bucket, number>) => BUCKETS.reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);

/** Allocation the % moves settle at if prices never moved (profit moves ignored: no growth with flat prices).
 * null when a section only receives and never sends (it would keep growing forever). */
export function steadyState(moves: Move[]): Record<Bucket, number> | null {
  const on = moves.filter((m) => m.on && m.kind === 'pct' && m.ratePct > 0);
  if (!on.length) return null;
  let w: Record<Bucket, number> = { cash: 0.25, lp: 0.25, tokens: 0.25, sov: 0.25 };
  for (let i = 0; i < 30000; i++) {
    const next = stepFlat(w, on);
    const diff = gapOf(next, w);
    w = next;
    if (diff < 1e-12) break;
  }
  return w;
}

/** Months for half of a gap to the steady state to close (prices flat) */
export function halfLifeMonths(moves: Move[]): number | null {
  const ss = steadyState(moves);
  if (!ss) return null;
  let w: Record<Bucket, number> = { cash: 1, lp: 0, tokens: 0, sov: 0 };
  const gap0 = gapOf(w, ss);
  for (let mth = 1; mth <= 600; mth++) {
    w = stepFlat(w, moves);
    if (gapOf(w, ss) <= gap0 / 2) return mth;
  }
  return null;
}

/** Month-by-month allocation from today's dollars, prices flat */
export function project(start: Record<Bucket, number>, moves: Move[], months: number): ({ m: number } & Record<Bucket, number>)[] {
  let w = { ...start };
  const out = [{ m: 0, ...w }];
  for (let i = 1; i <= months; i++) {
    w = stepFlat(w, moves);
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
  /** basket price per section on each day: 1 at the start */
  sov: number[];
  tokens: number[];
  lp: number[];
  btc: number[];
  hiveBtc: number[]; // HIVE/BTC ratio, for the alt indicator
  fng: (number | null)[];
}

export type Strategy = 'hold' | 'cycle' | 'signals' | 'rebalance';
export const STRATEGY_LABEL: Record<Strategy, string> = {
  hold: 'Buy and hold (no moves)',
  cycle: 'Your plan (fixed %)',
  signals: 'Your plan + market mood + targets',
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

/** Runs one strategy over the price history. Liquidity is priced as its two coins held 50/50 (no fees
 * earned, no impermanent loss - a rough stand-in). Profit moves sweep the value above the running cost. */
export function backtest(inp: BacktestInput, startW: Record<Bucket, number>, s: Settings, strategy: Strategy, startUsd = 10_000): BacktestResult {
  const n = inp.days.length;
  const px = (b: Bucket, i: number) => (b === 'cash' ? 1 : inp[b][i]!);
  const units: Record<Bucket, number> = { cash: 0, lp: 0, tokens: 0, sov: 0 };
  for (const b of BUCKETS) units[b] = (startUsd * startW[b]) / px(b, 0);
  let lpCost = startUsd * startW.lp;
  const value = (i: number) => BUCKETS.reduce((t, b) => t + units[b] * px(b, i), 0);
  const dailyCash = Math.pow(1 + s.cashAprPct / 100, 1 / 365);
  const values: number[] = [];
  let peak = 0;
  let maxDd = 0;
  let trades = 0;
  let fees = 0;
  const lastRun: Record<string, number> = {};
  let btcHigh = 0;
  const t = normTargets(s.targets);
  const transfer = (from: Bucket, to: Bucket, usd: number, i: number) => {
    usd = Math.min(usd, units[from] * px(from, i));
    if (!(usd > 0)) return;
    const fee = (usd * s.feePct) / 100;
    units[from] -= usd / px(from, i);
    units[to] += (usd - fee) / px(to, i);
    if (to === 'lp') lpCost += usd - fee;
    trades++;
    fees += fee;
  };
  for (let i = 0; i < n; i++) {
    if (i > 0) units.cash *= dailyCash;
    btcHigh = Math.max(btcHigh, inp.btc[i]!);
    const v = value(i);
    const have = Object.fromEntries(BUCKETS.map((b) => [b, units[b] * px(b, i)])) as Record<Bucket, number>;
    if (strategy === 'rebalance' && (i === 0 || i - (lastRun.reb ?? 0) >= 30)) {
      lastRun.reb = i;
      const want = Object.fromEntries(BUCKETS.map((b) => [b, v * t[b]])) as Record<Bucket, number>;
      for (const o of BUCKETS.filter((b) => have[b] > want[b]))
        for (const u of BUCKETS.filter((b) => have[b] < want[b])) {
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
      const w = Object.fromEntries(BUCKETS.map((b) => [b, have[b] / v])) as Record<Bucket, number>;
      const r = riskScore(inds, ss.weights);
      const alt = inds.find((x) => x.key === 'alt');
      for (const m of ss.moves) {
        if (!m.on) continue;
        const lr = lastRun[m.id];
        if (lr !== undefined && i - lr < m.everyDays) continue;
        lastRun[m.id] = i;
        if (m.kind === 'profit') {
          const profit = units[m.from] * px(m.from, i) - (m.from === 'lp' ? lpCost : Infinity);
          if (profit >= ss.minTradeUsd) transfer(m.from, m.to, profit, i);
          continue;
        }
        if (m.ratePct <= 0) continue;
        let mult = 1;
        if (strategy === 'signals') {
          if (m.tilt && ss.tiltStrength > 0) mult *= clamp(1 + ss.tiltStrength * moveSignal(m, r.score, alt ? alt.score : null, ss), 0, ss.maxMult);
          mult *= driftMult(m, w, ss);
          mult = clamp(mult, 0, ss.maxMult);
        }
        const usd = have[m.from] * (m.ratePct / 100) * mult;
        if (usd < ss.minTradeUsd) continue;
        const s2 = m.split ? m.split.pct / 100 : 0;
        if (m.from === 'lp') lpCost = Math.max(0, lpCost - usd);
        transfer(m.from, m.to, usd * (1 - s2), i);
        if (m.split && s2 > 0) transfer(m.from, m.split.to, usd * s2, i);
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

/* ------------------------------------------------------------------ the few things to deal with first */

export interface Issue {
  /** higher = more urgent */
  rank: number;
  tone: 'warn' | 'tip';
  title: string;
  text: string;
}

/** Up to `max` most urgent things across the whole plan, most urgent first */
export function topIssues(h: Holdings, s: Settings, planned: PlannedMove[], risk: Risk, lp: LpInfo | null, lps: LpStatus, max = 3): Issue[] {
  const out: Issue[] = [];
  const keep = new Set(s.keep.map((k) => k.toUpperCase()));
  if (lp?.inRange === false)
    out.push({ rank: 100, tone: 'warn', title: 'Liquidity is out of range', text: 'The ETH/BNB position earns no fees while out of range. Re-range it on PancakeSwap (or pause adding to it).' });
  const overdue = planned.filter((p) => !p.skipped && p.dueInDays <= -7);
  if (overdue.length)
    out.push({ rank: 80 + Math.min(10, overdue.length * 3), tone: 'warn', title: `${overdue.length} move${overdue.length > 1 ? 's are' : ' is'} more than a week overdue`, text: overdue.map((p) => `${BUCKET_LABEL[p.move.from]} → ${BUCKET_LABEL[p.move.to]} (${fmtUsd(p.usd)})`).join(', ') + '. Do it or press "Skip this time" so the dates reset.' });
  const s2c = planned.find((p) => p.move.from === 'sov' && p.move.to === 'cash' && !p.skipped);
  if (s2c && risk.score >= 0.6 && s2c.dueInDays <= 0)
    out.push({ rank: 85, tone: 'warn', title: 'Think twice before selling Store of Value this month', text: `The market is very fearful (${risk.agreeCount} of ${risk.used} signals agree). Selling ${fmtUsd(s2c.usd)} of it for cash now is selling near the lows; skipping this one month is reasonable.` });
  const buyFear = planned.find((p) => p.move.from === 'cash' && !p.skipped && p.dueInDays <= 0);
  if (buyFear && risk.score >= 0.6)
    out.push({ rank: 60, tone: 'tip', title: 'Fear is high: a good month for the Cash LP buy', text: `Do the ${fmtUsd(buyFear.usd)} Cash LP move now; fearful markets have usually been better times to buy than greedy ones.` });
  if (lps.profitUsd != null && lps.profitUsd >= s.minTradeUsd)
    out.push({ rank: 70, tone: 'tip', title: `Take ${fmtUsd(lps.profitUsd)} of Liquidity profit`, text: `The LP is worth ${lps.valueCad != null ? fmtCad(lps.valueCad) : '?'} vs ${fmtCad(lps.basisCad)} put in. Move the profit to Store of Value (the smallest coin) and harvest the CAKE.` });
  const big = [...h.items].filter((x) => !keep.has(x.key.toUpperCase())).sort((a, b) => b.valueUsd - a.valueUsd)[0];
  if (big && h.all > 0 && big.valueUsd / h.all > 0.35)
    out.push({ rank: 65 + Math.round((big.valueUsd / h.all - 0.35) * 100), tone: 'warn', title: `${big.key} is ${Math.round((big.valueUsd / h.all) * 100)}% of everything`, text: `One coin decides most of your result. Levelling Store of Value (Tokens → Store of Value buys go to the smallest coin) slowly fixes this; you could also speed it up once by moving some ${big.key} into ${big.bucket === 'sov' ? 'the smaller Store of Value coins' : 'Store of Value'}.` });
  for (const b of ['tokens'] as Bucket[]) {
    const list = h.items.filter((x) => x.bucket === b).sort((a, z) => z.valueUsd - a.valueUsd);
    const t = list[0];
    if (t && h.total[b] > 0 && t.valueUsd / h.total[b] > 0.8)
      out.push({ rank: 50, tone: 'warn', title: `${t.key} is ${Math.round((t.valueUsd / h.total[b]) * 100)}% of Tokens`, text: 'Point this month\'s token buys at other coins (Settings → Where bought value goes) or at Liquidity instead.' });
  }
  if (h.all > 0 && h.total.cash / h.all < 0.05)
    out.push({ rank: 55, tone: 'warn', title: 'Cash LP is under 5%', text: 'Little dry powder for the next dip. Consider pausing the Cash LP buy until it refills.' });
  if (lps.profitPct != null && lps.profitPct < -0.15)
    out.push({ rank: 45, tone: 'warn', title: `Liquidity is ${Math.round(-lps.profitPct * 100)}% below cost`, text: 'Check the position is still the right one (range, pair) before adding more to it.' });
  return out.sort((a, b) => b.rank - a.rank).slice(0, max);
}

/* ------------------------------------------------------------------ recommended % per move */

export interface Rec {
  pct: number;
  why: string;
}

const q25 = (v: number) => Math.round(v * 4) / 4;

/**
 * A suggested % for each move (key = move id) and for each split (key = `${id}:split`), worked out
 * from your target mix (Settings -> Targets, used here even when "nudge toward targets" is off):
 * with flat prices, a section stays at its target when what flows in equals what flows out, so
 *   Store of Value -> Cash  = Cash->(Tokens/LP) rate x Cash target / SOV target
 *   Tokens -> SOV           = Cash->(Tokens/LP) rate x share to Tokens x Cash target / Tokens target
 * The Cash LP rate itself follows how full Cash LP is versus its target. Market mood is NOT in these
 * (it already changes each month's amount on top), so they are steady settings, not timing calls.
 */
export function recommendRates(s: Settings, h: Holdings | null, lp: LpInfo | null): Record<string, Rec> {
  const out: Record<string, Rec> = {};
  const t = normTargets(s.targets);
  const w = h ? weightsOf(h) : null;
  const cashOut = s.moves.find((m) => m.on && m.kind === 'pct' && m.from === 'cash');
  const anchor = cashOut?.ratePct ?? 4;
  const share = (m: Move | undefined, b: Bucket) => (!m ? 0 : m.to === b ? 1 - (m.split ? m.split.pct / 100 : 0) : m.split?.to === b ? m.split.pct / 100 : 0);
  const pctT = (b: Bucket) => `${Math.round(t[b] * 100)}%`;
  for (const m of s.moves) {
    if (m.kind !== 'pct') continue;
    if (m.from === 'cash') {
      if (w && t.cash > 0) {
        const ratio = w.cash / t.cash;
        const pct = clamp(q25(4 * Math.sqrt(ratio)), 1, 8);
        out[m.id] = {
          pct,
          why:
            ratio < 0.8
              ? `Cash LP is ${Math.round(w.cash * 100)}% vs its ${pctT('cash')} target: spend it a bit slower so it can refill (market mood still makes this month's amount bigger in a dip).`
              : ratio > 1.25
                ? `Cash LP is ${Math.round(w.cash * 100)}% vs its ${pctT('cash')} target: plenty of dry powder, you can put it to work a bit faster.`
                : `Cash LP is close to its ${pctT('cash')} target: your 4% pace fits.`,
        };
      } else out[m.id] = { pct: 4, why: 'Your usual pace.' };
      if (m.split) {
        const pct = lp?.inRange === false ? 0 : clamp(Math.round(((t[m.split.to] / ((t[m.to] + t[m.split.to]) || 1)) * 100) / 5) * 5, 0, 100);
        out[`${m.id}:split`] = {
          pct,
          why: lp?.inRange === false && m.split.to === 'lp' ? 'The Liquidity position is out of range (earning no fees): send it all to Tokens until it is re-ranged.' : `Splits in line with your targets: ${BUCKET_LABEL[m.to]} ${pctT(m.to)}, ${BUCKET_LABEL[m.split.to]} ${pctT(m.split.to)}.`,
        };
      }
    } else if (m.from === 'sov' && m.to === 'cash') {
      const pct = t.sov > 0 ? clamp(q25((anchor * t.cash) / t.sov), 0.25, 10) : m.ratePct;
      out[m.id] = { pct, why: `Keeps Store of Value near its ${pctT('sov')} target: it only has to refill what Cash LP spends (${anchor}% of a section ${Math.round((t.cash / (t.sov || 1)) * 100)}% its size). A higher rate slowly shrinks Store of Value.` };
    } else if (m.from === 'tokens' && m.to === 'sov') {
      const inTok = share(cashOut, 'tokens');
      const pct = t.tokens > 0 ? clamp(q25((anchor * inTok * t.cash) / t.tokens), 0.25, 10) : m.ratePct;
      out[m.id] = { pct, why: `Tokens get ${anchor}% × ${Math.round(inTok * 100)}% of Cash LP each month; sending about the same back out keeps Tokens near its ${pctT('tokens')} target. Higher = Tokens shrink, lower = they grow.` };
    } else {
      out[m.id] = { pct: m.ratePct, why: 'No suggestion for this kind of move.' };
    }
  }
  return out;
}

/* ------------------------------------------------------------------ Canadian tax check (gains, superficial losses) */

/** Average cost per coin from the Taxes page's ACB pools (all wallets pooled, as the CRA requires) */
export type AcbMap = Record<string, { qty: number; acbUsd: number; acbCad: number | null }>;

const TAX_ALIAS: Record<string, string> = { WBNB: 'BNB', WETH: 'ETH', 'SWAP.HIVE': 'HIVE', BTCB: 'BTC', WBTC: 'BTC' };
const taxKey = (k: string) => TAX_ALIAS[k.toUpperCase()] ?? k.toUpperCase();

export interface TaxLeg {
  key: string;
  amount: number;
  /** gain (+) or loss (-) in CAD at today's price vs your average cost */
  gainCad: number;
  /** part of a loss that would be "superficial" (not deductible now) because the plan buys the same coin within 30 days */
  deniedCad: number;
  boughtAmount: number;
  costPer: number;
  pricePer: number;
}

/** For each move's sells: the gain or loss, and how much of a loss the plan's own buys would make superficial */
export function taxCheck(planned: PlannedMove[], acb: AcbMap | null, cadRate: number | null): Record<string, TaxLeg[]> {
  const out: Record<string, TaxLeg[]> = {};
  if (!acb || !cadRate) return out;
  for (const p of planned) {
    if (p.skipped || !p.sells.length) continue;
    const legs: TaxLeg[] = [];
    for (const s of p.sells) {
      const k = taxKey(s.key);
      const pool = acb[k];
      if (!pool || !(pool.qty > 0) || s.amount == null || !(s.amount > 0)) continue;
      const pricePer = s.usd / s.amount;
      const costPerUsd = pool.acbUsd / pool.qty;
      const costPerCad = pool.acbCad != null ? pool.acbCad / pool.qty : costPerUsd * cadRate;
      const gainCad = s.amount * (pricePer * cadRate - costPerCad);
      // the same coin bought by any move due within 30 days of this one (the 61-day window around the sale)
      let bought = 0;
      for (const q of planned) {
        if (q.skipped || Math.abs(q.dueInDays - p.dueInDays) > 30) continue;
        for (const b of q.buys) if (taxKey(b.key) === k && b.amount != null) bought += b.amount;
      }
      const denied = gainCad < 0 ? -gainCad * Math.min(1, bought / s.amount) : 0;
      legs.push({ key: k, amount: s.amount, gainCad, deniedCad: denied, boughtAmount: bought, costPer: costPerUsd, pricePer });
    }
    if (legs.length) out[p.move.id] = legs;
  }
  return out;
}

/** Plain notes for one move from its tax check */
export function taxNotes(legs: TaxLeg[] | undefined): Note[] {
  if (!legs || !legs.length) return [];
  const n: Note[] = [];
  const cad = (v: number) => fmtCad(Math.abs(v));
  const price = (v: number) => (v >= 1000 ? fmtUsd(v) : '$' + v.toPrecision(3));
  for (const l of legs) {
    if (l.deniedCad >= 5) {
      const all = l.deniedCad >= -l.gainCad - 0.5;
      const fix =
        l.key === 'BTC'
          ? ' (selling and buying BTC in the same month also just pays fees twice: set "Store of Value sales come from" to "the biggest coin first" so only XRP is sold)'
          : ' (point that buy at another coin for a month)';
      n.push({
        tone: 'warn',
        text:
          'Tax: selling ' + l.key + ' books a ' + cad(l.gainCad) + ' loss (your average cost ' + price(l.costPer) + ' vs ' + price(l.pricePer) + ' now), but this month\'s plan also BUYS ' + l.key +
          ', so ' + (all ? 'all' : 'about ' + cad(l.deniedCad)) + ' of that loss is "superficial": you can\'t claim it this year. It isn\'t lost: it is added to the cost of the ' + l.key +
          ' you keep and counts when you sell those later. To claim the loss now, don\'t buy ' + l.key + ' within 30 days before or after this sale' + fix + '.',
      });
    } else if (l.gainCad <= -5) {
      n.push({ tone: 'info', text: 'Tax: selling ' + l.key + ' books about a ' + cad(l.gainCad) + ' capital loss (average cost ' + price(l.costPer) + ' vs ' + price(l.pricePer) + ' now). It can offset gains. Don\'t buy ' + l.key + ' back within 30 days or it is denied.' });
    } else if (l.gainCad >= 50) {
      n.push({ tone: 'info', text: 'Tax: selling ' + l.key + ' books about a ' + cad(l.gainCad) + ' capital gain; half of it is taxable income.' });
    }
  }
  return n;
}
