/**
 * mes.fm/summary - the portfolio's history, one row per check (was the "Summary" tab of MES Cryptos.xlsx).
 * Pure: types, cleaning and the maths the page shows. Rows are kept in Upstash by /api/summary.
 *
 * Total = Tokens + Cash LP + Liquidity + AI Trading + Store of Value. MikeFA Trading is shown but NOT
 * counted (same as the spreadsheet's Total column).
 */

export interface SummaryRow {
  /** yyyy-mm-dd */
  d: string;
  /** check number (the spreadsheet's Invoice #) */
  n: number;
  tokens: number;
  cash: number;
  lp: number;
  ai: number;
  mfa: number;
  sov: number;
  /** USD -> CAD */
  cad: number | null;
  /** BTC price, USD */
  btc: number | null;
  /** Bitcoin dominance, % */
  dom: number | null;
  /** crypto fear & greed, 0-100 */
  fng: number | null;
  note?: string;
}

export const PARTS = ['sov', 'tokens', 'lp', 'cash', 'ai'] as const;
export type Part = (typeof PARTS)[number];
export const PART_LABEL: Record<Part | 'mfa', string> = { sov: 'Store of Value', tokens: 'Tokens', lp: 'Liquidity', cash: 'Cash LP', ai: 'AI Trading', mfa: 'MikeFA' };
export const PART_COLOR: Record<Part, string> = { sov: '#f0b90b', tokens: '#a855f7', lp: '#3b82f6', cash: '#22c55e', ai: '#06b6d4' };

const num = (v: unknown, lo = 0, hi = 1e12): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

export function cleanRow(x: unknown): SummaryRow | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (typeof r.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.d)) return null;
  return {
    d: r.d,
    n: Math.round(num(r.n, 0, 1e6) ?? 0),
    tokens: num(r.tokens) ?? 0,
    cash: num(r.cash) ?? 0,
    lp: num(r.lp) ?? 0,
    ai: num(r.ai) ?? 0,
    mfa: num(r.mfa) ?? 0,
    sov: num(r.sov) ?? 0,
    cad: num(r.cad, 0.5, 5),
    btc: num(r.btc, 1, 1e8),
    dom: num(r.dom, 0, 100),
    fng: num(r.fng, 0, 100),
    note: typeof r.note === 'string' && r.note ? r.note.slice(0, 300) : undefined,
  };
}

/** Oldest first, one row per date (the later one wins) */
export function cleanRows(list: unknown): SummaryRow[] {
  const by = new Map<string, SummaryRow>();
  if (Array.isArray(list)) for (const x of list) { const r = cleanRow(x); if (r) by.set(r.d, r); }
  return [...by.values()].sort((a, b) => a.d.localeCompare(b.d));
}

export const totalOf = (r: Pick<SummaryRow, Part>) => r.sov + r.tokens + r.lp + r.cash + r.ai;

/** Change from the previous row: USD and fraction */
export function changes(rows: SummaryRow[]) {
  return rows.map((r, i) => {
    const t = totalOf(r);
    const p = i > 0 ? totalOf(rows[i - 1]!) : null;
    return { row: r, total: t, diff: p == null ? null : t - p, frac: p ? (t - p) / p : null };
  });
}

/** Share of each part of the total */
export function weights(r: Pick<SummaryRow, Part>): Record<Part, number> {
  const t = totalOf(r) || 1;
  return { sov: r.sov / t, tokens: r.tokens / t, lp: r.lp / t, cash: r.cash / t, ai: r.ai / t };
}

/** Highest total so far and how far below it a row is */
export function peak(rows: SummaryRow[]) {
  let best: { d: string; total: number } | null = null;
  for (const r of rows) { const t = totalOf(r); if (!best || t > best.total) best = { d: r.d, total: t }; }
  return best;
}

export function toCsv(rows: SummaryRow[]): string {
  const head = ['Date', 'Check #', 'Store of Value', 'Tokens', 'Liquidity', 'Cash LP', 'AI Trading', 'MikeFA (not counted)', 'Total USD', 'USD to CAD', 'Total CAD', 'BTC price', 'Total in BTC', 'BTC dominance %', 'Fear & Greed', 'Note'];
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = rows.map((r) => {
    const t = totalOf(r);
    return [r.d, r.n, r.sov, r.tokens, r.lp, r.cash, r.ai, r.mfa, t.toFixed(2), r.cad ?? '', r.cad ? (t * r.cad).toFixed(2) : '', r.btc ?? '', r.btc ? (t / r.btc).toFixed(4) : '', r.dom ?? '', r.fng ?? '', r.note ?? ''].map(esc).join(',');
  });
  return [head.join(','), ...lines].join('\n');
}
