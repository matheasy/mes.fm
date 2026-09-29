import { cached, cacheKey } from '../../cache';
import type { TaxEntry } from '../acb';
import { HIVE_ACCOUNTS } from '../accounts';
import { getDailySeries, priceOn } from '../dailyPrices';

const HISTORY = 'https://history.hive-engine.com';
const SYMBOL = 'TGLD';
/** Accounts whose TGLD transfers are yield payouts - income */
const YIELD_ACCOUNTS = new Set(['tgld.yield']);
/** A day's Hive Engine trading counts as a price only above this much HIVE traded - below it, it's dust */
const MIN_DAY_VOLUME_HIVE = 5;

interface HeRow {
  timestamp: number;
  operation: string;
  from?: string;
  to?: string;
  symbol?: string;
  quantity?: string;
  quantityTokens?: string;
  quantityHive?: string;
  transactionId?: string;
}

interface DayRow {
  timestamp: number;
  volumeHive: string;
  volumeToken: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Hive Engine history answered ${res.status}`);
  return (await res.json()) as T;
}

async function accountHistory(account: string): Promise<HeRow[]> {
  const out: HeRow[] = [];
  for (let offset = 0; offset < 100_000; offset += 500) {
    const rows = await getJson<HeRow[]>(`${HISTORY}/accountHistory?account=${account}&symbol=${SYMBOL}&limit=500&offset=${offset}`);
    out.push(...rows);
    if (rows.length < 500) return out;
  }
  throw new Error(`TGLD history for @${account} longer than expected`);
}

/**
 * HIVE per TGLD by day: each day's volume-weighted price (HIVE traded / TGLD traded) where real volume
 * traded, carried forward over dust-only days. The market's daily open/close is useless here - recent
 * "trades" are 0.001 TGLD at 0.00003 HIVE.
 */
async function hivePerTgld(): Promise<(iso: string) => number | null> {
  const days = await getJson<DayRow[]>(`${HISTORY}/marketHistory?symbol=${SYMBOL}`);
  const points = days
    .filter((d) => Number(d.volumeHive) >= MIN_DAY_VOLUME_HIVE && Number(d.volumeToken) > 0)
    .map((d) => [d.timestamp * 1000, Number(d.volumeHive) / Number(d.volumeToken)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  return (iso) => {
    if (!points.length) return null;
    const t = Date.parse(iso);
    let price = points[0]![1];
    for (const [pt, p] of points) {
      if (pt > t) break;
      price = p;
    }
    return price;
  };
}

/**
 * TGLD on Hive Engine for every Hive account, as tax legs. Transfers in/out and market fills change
 * what's owned; staking doesn't. A market fill is valued at the HIVE actually paid or received;
 * anything else at that day's traded HIVE-per-TGLD. Both then x HIVE/USD that day. The SWAP.HIVE side
 * of a fill isn't tracked (Hive Engine's other tokens aren't yet), so a fill is one TGLD leg marked
 * as a market trade.
 */
export async function getTgldEntries(): Promise<TaxEntry[]> {
  const rows = await cached(
    cacheKey('tgld-history-v1'),
    async () => (await Promise.all(HIVE_ACCOUNTS.map(async (a) => (await accountHistory(a)).map((r) => ({ ...r, account: a }))))).flat(),
    30 * 60,
  );
  if (rows.length === 0) return [];

  const [ratio, hive] = await Promise.all([
    hivePerTgld(),
    getDailySeries('hive', new Date(Math.min(...rows.map((r) => r.timestamp)) * 1000).toISOString()),
  ]);

  const entries: TaxEntry[] = [];
  for (const r of rows) {
    const account = r.account;
    const timestamp = new Date(r.timestamp * 1000).toISOString();
    const hash = r.transactionId ?? `${r.operation}-${r.timestamp}`;
    const hiveUsd = priceOn(hive, timestamp);
    const base = { source: `hive:${account}`, hash, network: 'hive-engine', timestamp, symbol: SYMBOL };

    if (r.operation === 'tokens_transfer' || r.operation === 'tokens_transferFrom' || r.operation === 'tokens_issue') {
      const qty = Number(r.quantity ?? 0);
      if (!qty || r.from === r.to) continue;
      const incoming = r.to === account;
      const perToken = ratio(timestamp);
      entries.push({
        ...base,
        amount: incoming ? qty : -qty,
        priceUsd: perToken !== null && hiveUsd !== null ? perToken * hiveUsd : null,
        from: r.from ?? 'hive-engine',
        to: r.to ?? account,
        income: incoming && r.from && YIELD_ACCOUNTS.has(r.from) ? 'TGLD yield' : undefined,
      });
    } else if (r.operation === 'market_buy' || r.operation === 'market_sell') {
      const tokens = Number(r.quantityTokens ?? 0);
      const hivePaid = Number(r.quantityHive ?? 0);
      if (!tokens) continue;
      const buy = r.operation === 'market_buy';
      const perToken = hivePaid > 0 ? hivePaid / tokens : ratio(timestamp);
      entries.push({
        ...base,
        amount: buy ? tokens : -tokens,
        priceUsd: perToken !== null && hiveUsd !== null ? perToken * hiveUsd : null,
        from: buy ? 'hive-engine-market' : account,
        to: buy ? account : 'hive-engine-market',
        market: true,
      });
    }
  }
  return entries;
}
