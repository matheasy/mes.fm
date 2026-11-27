/**
 * The overview's charts: one row a day of every section's value, kept in Upstash by /api/portfolio/daily.
 * The overview page writes today's row itself from the numbers it already loaded (no extra price or chain
 * calls), so the history fills in on the days the page is opened. Older dates come from mes.fm/summary's
 * checks. Pure: types, cleaning and the merge the chart uses.
 */
import { cleanRows as cleanSummaryRows, type SummaryRow } from './summary';

export const SECS = ['sov', 'tokens', 'lp', 'cash', 'ai', 'mfa'] as const;
export type Sec = (typeof SECS)[number];
export type Slice = Sec | 'other';

export const SEC_LABEL: Record<Slice, string> = {
  sov: 'Store of Value',
  tokens: 'Tokens',
  lp: 'Liquidity',
  cash: 'Cash LP',
  ai: 'AI Trading',
  mfa: 'MikeFA Trading',
  other: 'Not in a section',
};
export const SEC_COLOR: Record<Slice, string> = {
  sov: '#f0b90b',
  tokens: '#a855f7',
  lp: '#3b82f6',
  cash: '#22c55e',
  ai: '#06b6d4',
  mfa: '#ec4899',
  other: '#8a94a6',
};

export interface DailyRow {
  /** yyyy-mm-dd (UTC) */
  d: string;
  sov: number;
  tokens: number;
  lp: number;
  cash: number;
  ai: number;
  mfa: number;
  /** mes.fm/assets' grand total, when known */
  all: number | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12 ? Math.round(v * 100) / 100 : null);

export function cleanDaily(x: unknown): DailyRow | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (typeof r.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.d)) return null;
  const out: DailyRow = { d: r.d, sov: 0, tokens: 0, lp: 0, cash: 0, ai: 0, mfa: 0, all: num(r.all) };
  for (const s of SECS) out[s] = num(r[s]) ?? 0;
  return out;
}

/** Oldest first, one row per date (the later one wins) */
export function cleanDailyRows(list: unknown): DailyRow[] {
  const by = new Map<string, DailyRow>();
  if (Array.isArray(list)) for (const x of list) { const r = cleanDaily(x); if (r) by.set(r.d, r); }
  return [...by.values()].sort((a, b) => a.d.localeCompare(b.d));
}

export interface HistPoint extends DailyRow {
  /** where the row came from */
  src: 'daily' | 'summary' | 'live';
}

/** Daily rows win; mes.fm/summary checks fill the dates with no daily row; `live` = today's numbers */
export function mergeHistory(daily: DailyRow[], summary: unknown, live: DailyRow | null): HistPoint[] {
  const by = new Map<string, HistPoint>();
  for (const r of cleanSummaryRows(summary) as SummaryRow[]) {
    by.set(r.d, { d: r.d, sov: r.sov, tokens: r.tokens, lp: r.lp, cash: r.cash, ai: r.ai, mfa: r.mfa, all: null, src: 'summary' });
  }
  for (const r of daily) by.set(r.d, { ...r, src: 'daily' });
  if (live) by.set(live.d, { ...live, src: 'live' });
  return [...by.values()].sort((a, b) => a.d.localeCompare(b.d));
}

export const utcToday = () => new Date().toISOString().slice(0, 10);
