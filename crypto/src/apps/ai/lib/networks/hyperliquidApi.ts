import { RateLimitError } from '../errors';

/** Hyperliquid's public, keyless `/info` REST API - covers HyperCore (spot + perps), not HyperEVM (see hyperevm.ts) */
const API_BASE = 'https://api.hyperliquid.xyz/info';

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    next: { revalidate: 0 },
  });
  if (res.status === 429) throw new RateLimitError('Hyperliquid API rate limit reached');
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Hyperliquid API request failed: ${res.status} ${text}`.trim());
  }
  return res.json() as Promise<T>;
}

export interface PerpPositionRaw {
  position: {
    coin: string;
    szi: string;
    entryPx: string;
    positionValue: string;
    unrealizedPnl: string;
    liquidationPx: string | null;
    marginUsed: string;
  };
}

export interface ClearinghouseState {
  marginSummary: { accountValue: string; totalMarginUsed: string };
  assetPositions: PerpPositionRaw[];
}

export function getClearinghouseState(user: string): Promise<ClearinghouseState> {
  return post({ type: 'clearinghouseState', user });
}

export interface SpotBalance {
  coin: string;
  token: number;
  total: string;
  hold: string;
  entryNtl: string;
}

export function getSpotClearinghouseState(user: string): Promise<{ balances: SpotBalance[] }> {
  return post({ type: 'spotClearinghouseState', user });
}

export interface SpotMetaToken {
  name: string;
  index: number;
  szDecimals: number;
  weiDecimals: number;
}

export interface SpotMetaUniverseEntry {
  name: string;
  tokens: [number, number];
  index: number;
}

export interface SpotMeta {
  tokens: SpotMetaToken[];
  universe: SpotMetaUniverseEntry[];
}

export function getSpotMeta(): Promise<SpotMeta> {
  return post({ type: 'spotMeta' });
}

/** Current mid prices, keyed by perp coin name (e.g. "BTC") or spot pair display name (e.g. "PURR/USDC") */
export function getAllMids(): Promise<Record<string, string>> {
  return post({ type: 'allMids' });
}

export interface Fill {
  coin: string;
  side: string;
  px: string;
  sz: string;
  time: number;
  closedPnl: string;
  fee: string;
  oid: number;
  tid: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FILL_PAGE_WINDOW_MS = 1000 * 60 * 60 * 24 * 90; // Hyperliquid caps userFillsByTime at 500 fills/call; page by time
const MAX_FILL_PAGES = 12; // ~3 years of history at 90 days/page - documented cap, not exhaustive for very old wallets
const PAGE_DELAY_MS = 250;

const EMPTY_WINDOWS_BEFORE_STOP = 2;

/**
 * Paginates userFillsByTime backward from now toward `startTime`, up to MAX_FILL_PAGES windows -
 * stops early after EMPTY_WINDOWS_BEFORE_STOP consecutive empty windows, so a low-activity wallet
 * (the common case) doesn't burn the full request budget walking back years of empty history.
 * Trade-off: a wallet that traded heavily long ago then went fully quiet more recently than that
 * would have its older fills missed - an accepted, documented limitation, not exhaustive history.
 */
export async function getFillsSince(user: string, startTime: number): Promise<Fill[]> {
  const out: Fill[] = [];
  let windowEnd = Date.now();
  let consecutiveEmpty = 0;

  for (let page = 0; page < MAX_FILL_PAGES && windowEnd > startTime && consecutiveEmpty < EMPTY_WINDOWS_BEFORE_STOP; page++) {
    if (page > 0) await sleep(PAGE_DELAY_MS);
    const windowStart = Math.max(windowEnd - FILL_PAGE_WINDOW_MS, startTime);
    const batch = await post<Fill[]>({ type: 'userFillsByTime', user, startTime: windowStart, endTime: windowEnd, aggregateByTime: true });
    out.push(...batch);
    consecutiveEmpty = batch.length === 0 ? consecutiveEmpty + 1 : 0;
    windowEnd = windowStart;
  }

  return out;
}
