import { HIVE_ENGINE_HISTORY_URL, HIVE_ENGINE_RPC_URL } from '../config';
import { RateLimitError } from '../errors';
import { createThrottle } from './rateLimit';

/**
 * Hive Engine is a smart-contract layer on top of the Hive blockchain. Token balances and the
 * internal market live in its `tokens` / `market` contracts (queried via the contract-RPC node);
 * per-account token history comes from a separate history node. Both keyless.
 */

const throttle = createThrottle('hive-engine', 300);

async function contractsRpc<T>(method: 'find' | 'findOne', params: Record<string, unknown>): Promise<T> {
  return throttle(async () => {
    const res = await fetch(`${HIVE_ENGINE_RPC_URL}/contracts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      next: { revalidate: 0 },
    });
    if (res.status === 429) throw new RateLimitError('Hive Engine rate limit reached');
    if (!res.ok) throw new Error(`Hive Engine RPC failed: ${res.status}`);

    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`Hive Engine error: ${json.error.message}`);
    return json.result as T;
  });
}

export interface HeBalance {
  account: string;
  symbol: string;
  balance: string;
  stake?: string;
  pendingUnstake?: string;
  delegationsIn?: string;
  delegationsOut?: string;
}

export async function getTokenBalance(account: string, symbol: string): Promise<HeBalance | null> {
  const rows = await contractsRpc<HeBalance[]>('find', {
    contract: 'tokens',
    table: 'balances',
    query: { account, symbol },
    limit: 1,
    offset: 0,
    indexes: [],
  });
  return rows?.[0] ?? null;
}

export interface HeMarketMetrics {
  symbol: string;
  /** last traded price in HIVE per token */
  lastPrice?: string;
  bid?: string;
  ask?: string;
}

export async function getMarketMetrics(symbol: string): Promise<HeMarketMetrics | null> {
  return contractsRpc<HeMarketMetrics | null>('findOne', {
    contract: 'market',
    table: 'metrics',
    query: { symbol },
  });
}

export interface HeHistoryRow {
  /** unix seconds */
  timestamp: number;
  operation: string;
  from?: string;
  to?: string;
  symbol?: string;
  quantity?: string;
  /** market fill fields */
  quantityTokens?: string;
  quantityHive?: string;
  price?: string;
  transactionId?: string;
}

/** Full TGLD history for an account, paginated (newest first) up to a sane cap */
export async function getAccountHistory(account: string, symbol: string): Promise<HeHistoryRow[]> {
  const out: HeHistoryRow[] = [];
  const LIMIT = 100;

  for (let offset = 0; offset < 2000; offset += LIMIT) {
    const url = `${HIVE_ENGINE_HISTORY_URL}/accountHistory?account=${encodeURIComponent(account)}&symbol=${encodeURIComponent(symbol)}&limit=${LIMIT}&offset=${offset}`;
    const rows = await throttle(async () => {
      const res = await fetch(url, { next: { revalidate: 0 } });
      if (res.status === 429) throw new RateLimitError('Hive Engine history rate limit reached');
      if (!res.ok) throw new Error(`Hive Engine history failed: ${res.status}`);
      const json = (await res.json()) as HeHistoryRow[];
      return Array.isArray(json) ? json : [];
    });
    out.push(...rows);
    if (rows.length < LIMIT) break;
  }

  return out;
}
