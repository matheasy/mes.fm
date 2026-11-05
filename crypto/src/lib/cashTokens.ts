import { getSnapshot } from '@/apps/assets/lib/snapshot';
import { getSpot } from '@/apps/assets/lib/prices';
import { HIVE_ENGINE_RPC } from '@/apps/assets/lib/config';
import { getCadRates } from '@/lib/cadRate';
import type { BucketItem, BucketSnapshot } from '@/lib/types';
import { CASH_EXTRA, SOV_SYMBOLS, STABLE_SYMBOLS } from '@/lib/sections';

/**
 * mes.fm/cash ("Cash LP") and mes.fm/tokens - two more slices of mes.fm/assets' snapshot, like
 * Store of Value and Liquidity. Every holding lands on at most one page:
 *  - AI Trading / MikeFA: everything in those two wallets (their own pages) - left out here
 *  - Store of Value: Bitcoin in every form, XRP, TGLD (any wallet)
 *  - Liquidity: the Main wallet's PancakeSwap position + its CAKE farm rewards (BNB Chain)
 *  - Random Wallets: hand-entered, never in the snapshot
 *  - Cash LP: stablecoins (HBD, USDT, USDC ...), the Magi (altera.magi.eco) BTC/HBD pool, and ACE +
 *    SURGE on Hive Engine
 *  - Tokens: everything else, per token (summed across wallets), when it is worth $10 or more
 */

const HIVE_ACCOUNTS = ['mes', 'mestruth', 'mathiew', 'artgrafiken'];

/** The same coin under another name: summed as one token on mes.fm/tokens */
const ALIAS: Record<string, string> = { 'SWAP.HIVE': 'HIVE', 'SWAP.ETH': 'ETH', WETH: 'ETH', WBNB: 'BNB', 'SWAP.BNB': 'BNB', WPOL: 'POL', MATIC: 'POL', WHYPE: 'HYPE' };
const NAMES: Record<string, string> = {
  HBD: 'Hive Dollars (HBD)', HIVE: 'HIVE', ETH: 'Ethereum', BNB: 'BNB', POL: 'Polygon (POL)', LEO: 'LEO', ACE: 'ACE', SURGE: 'SURGE',
  USDT: 'Tether (USDT)', USDC: 'USD Coin (USDC)', HYPE: 'Hyperliquid (HYPE)',
};
export const TOKENS_MIN_USD = 10;

interface H {
  group: string;
  source: string;
  kind: string;
  symbol: string;
  label?: string;
  amount: number;
  valueUsd: number | null;
  lp?: { pool: string; legs: { symbol: string; amount: number; valueUsd: number | null }[] };
}

export type Bucket = 'cash' | 'tokens' | 'other';

/** Which page a snapshot holding belongs to (see the file comment) */
export function bucketOf(h: Pick<H, 'group' | 'source' | 'kind' | 'symbol' | 'lp'>): Bucket {
  if (h.group === 'ai' || h.group === 'mfa') return 'other';
  if (h.group === 'main' && h.source === 'bsc' && (h.kind === 'lp' || h.kind === 'reward')) return 'other'; // mes.fm/lp
  const sym = h.symbol.toUpperCase();
  if (h.kind === 'lp') {
    if (h.source === 'magi' && /BTC/.test(h.lp?.pool ?? sym) && /HBD/.test(h.lp?.pool ?? sym)) return 'cash';
    return 'tokens';
  }
  if (STABLE_SYMBOLS.has(sym) || CASH_EXTRA.has(sym)) return 'cash';
  if (SOV_SYMBOLS.has(sym)) return 'other';
  return 'tokens';
}

async function heFind<T>(contract: string, table: string, query: Record<string, unknown>): Promise<T[]> {
  const res = await fetch(`${HIVE_ENGINE_RPC}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'find', params: { contract, table, query, limit: 1000 } }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Hive Engine answered ${res.status}`);
  return ((await res.json()) as { result: T[] | null }).result ?? [];
}

/**
 * SURGE (LeoStrategy's $1-par preferred token) read straight from Hive Engine: mes.fm/assets drops it,
 * because its order book's last trade is dust (0.000001 HIVE). Its real market is the SURGE:LEO pool,
 * so it is priced through LEO (LEO's own HIVE price x HIVE in USD). Par ($1 each) is kept for reference.
 */
async function surgeRows(): Promise<H[]> {
  const [balances, pools, leo, spot] = await Promise.all([
    heFind<Record<string, string>>('tokens', 'balances', { symbol: 'SURGE', account: { $in: HIVE_ACCOUNTS } }),
    heFind<{ tokenPair: string; basePrice: string }>('marketpools', 'pools', { tokenPair: 'SURGE:LEO' }),
    heFind<{ lastPrice: string; highestBid: string }>('market', 'metrics', { symbol: 'LEO' }),
    getSpot(),
  ]);
  const leoHive = Number(leo[0]?.highestBid) || Number(leo[0]?.lastPrice) || 0;
  const surgeLeo = Number(pools[0]?.basePrice) || 0;
  const price = surgeLeo * leoHive * spot.hive.usd;
  return balances
    .map((b) => ({ account: b.account!, amount: ['balance', 'stake', 'pendingUnstake', 'delegationsOut'].reduce((s, k) => s + (Number(b[k]) || 0), 0) }))
    .filter((b) => b.amount > 0)
    .map((b) => ({
      group: b.account,
      source: 'hive-engine',
      kind: 'token',
      symbol: 'SURGE',
      label: 'SURGE',
      amount: b.amount,
      valueUsd: price > 0 ? b.amount * price : null,
    }));
}

function whereOf(groupLabel: Map<string, string>, h: H): string {
  if (HIVE_ACCOUNTS.includes(h.group)) return `Hive @${h.group}`;
  return groupLabel.get(h.group) ?? h.group;
}

async function base() {
  const snap = await getSnapshot({ minValueUsd: 0 });
  const groupLabel = new Map(snap.groups.map((g) => [g.key, g.label]));
  const today = new Date().toISOString().slice(0, 10);
  const cadRate = (await getCadRates([today]).catch(() => new Map<string, number>())).get(today) ?? null;
  return { snap, groupLabel, cadRate, holdings: snap.holdings as unknown as H[] };
}

function sumInto(map: Map<string, BucketItem>, key: string, name: string, h: H, where: string) {
  const it = map.get(key) ?? { key, name, amount: 0, valueUsd: 0, lines: [] };
  it.amount = (it.amount ?? 0) + h.amount;
  it.valueUsd += h.valueUsd ?? 0;
  it.lines.push({ where, source: h.source, symbol: h.symbol, label: h.label ?? h.symbol, amount: h.amount, valueUsd: h.valueUsd });
  map.set(key, it);
}

function finish(items: BucketItem[]) {
  for (const it of items) it.lines.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  return items.sort((a, b) => b.valueUsd - a.valueUsd);
}

/** GET /api/cash's data */
export async function cashSnapshot(): Promise<BucketSnapshot> {
  const { snap, groupLabel, cadRate, holdings } = await base();
  const surge = await surgeRows().catch(() => [] as H[]);
  const map = new Map<string, BucketItem>();
  const pools: BucketItem[] = [];
  for (const h of holdings) {
    if (!(h.amount > 0) || bucketOf(h) !== 'cash') continue;
    const sym = h.symbol.toUpperCase();
    if (sym === 'SURGE') continue; // read directly, below
    const where = whereOf(groupLabel, h);
    if (h.kind === 'lp') {
      pools.push({
        key: `${h.lp?.pool ?? h.symbol} pool`,
        name: `${h.lp?.pool ?? h.symbol} pool (Magi, altera.magi.eco)`,
        amount: null,
        valueUsd: h.valueUsd ?? 0,
        legs: h.lp?.legs ?? [],
        note: 'Liquidity pool on Magi: half Bitcoin, half HBD, so its value moves with Bitcoin as well.',
        lines: [{ where, source: h.source, symbol: h.symbol, label: h.label ?? h.symbol, amount: h.amount, valueUsd: h.valueUsd }],
      });
      continue;
    }
    const key = sym.startsWith('SWAP.') ? sym.slice(5) : sym; // SWAP.HBD is HBD on Hive Engine
    sumInto(map, key, NAMES[key] ?? key, h, where);
  }
  for (const h of surge) sumInto(map, 'SURGE', 'SURGE', h, whereOf(groupLabel, h));
  const s = map.get('SURGE');
  if (s) {
    s.parUsd = s.amount ?? 0;
    s.note = 'LeoStrategy token with a $1 par value. Valued at its market price (the SURGE:LEO pool on Hive Engine); at par it would be the amount shown.';
  }
  const a = map.get('ACE');
  if (a) a.note = 'Valued at its last Hive Engine market price.';
  if (map.size === 0 && pools.length === 0) throw new Error('No cash balances came back - try again in a minute');
  const items = finish([...map.values(), ...pools]);
  return { fetchedAt: snap.fetchedAt, cadRate, totalUsd: items.reduce((t, i) => t + i.valueUsd, 0), items };
}

/** GET /api/tokens's data */
export async function tokensSnapshot(): Promise<BucketSnapshot> {
  const { snap, groupLabel, cadRate, holdings } = await base();
  const map = new Map<string, BucketItem>();
  for (const h of holdings) {
    if (!(h.amount > 0) || bucketOf(h) !== 'tokens') continue;
    const sym = h.symbol.toUpperCase();
    const where = whereOf(groupLabel, h);
    if (h.kind === 'lp') {
      const key = `${h.lp?.pool ?? h.symbol} pool`;
      const it = map.get(key) ?? { key, name: h.label ?? key, amount: null, valueUsd: 0, legs: h.lp?.legs ?? [], lines: [] };
      it.valueUsd += h.valueUsd ?? 0;
      it.lines.push({ where, source: h.source, symbol: h.symbol, label: h.label ?? h.symbol, amount: h.amount, valueUsd: h.valueUsd });
      map.set(key, it);
      continue;
    }
    const key = ALIAS[sym] ?? sym;
    sumInto(map, key, NAMES[key] ?? key, h, where);
  }
  // an empty list means a source failed (HIVE alone is always here): don't cache or save it as the last answer
  if (map.size === 0) throw new Error('No token balances came back - try again in a minute');
  const all = finish([...map.values()]);
  const items = all.filter((i) => i.valueUsd >= TOKENS_MIN_USD);
  const rest = all.filter((i) => i.valueUsd < TOKENS_MIN_USD);
  return {
    fetchedAt: snap.fetchedAt,
    cadRate,
    totalUsd: items.reduce((t, i) => t + i.valueUsd, 0),
    items,
    hidden: { count: rest.length, usd: rest.reduce((t, i) => t + i.valueUsd, 0) },
  };
}
