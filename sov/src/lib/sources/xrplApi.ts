import { XRPL_RPC_URL } from '../config';
import { RateLimitError } from '../errors';
import { createThrottle } from './rateLimit';

/**
 * Minimal XRP Ledger JSON-RPC client. Handles both response shapes seen in the wild: rippled
 * (transaction under `tx`, unix-ish `date` in Ripple epoch seconds) and Clio (transaction under
 * `tx_json`, ISO `close_time_iso` alongside). Keyless.
 */

const throttle = createThrottle('xrpl', 400);

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  return throttle(async () => {
    const res = await fetch(XRPL_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, params: [params] }),
      next: { revalidate: 0 },
    });
    if (res.status === 429) throw new RateLimitError('XRPL RPC rate limit reached');
    if (!res.ok) throw new Error(`XRPL RPC failed: ${res.status}`);

    const json = (await res.json()) as {
      result?: T & { status?: string; error?: string; error_message?: string };
    };
    const result = json.result;
    if (!result || result.status === 'error') {
      throw new Error(`XRPL RPC error: ${result?.error_message ?? result?.error ?? 'unknown error'}`);
    }
    return result as T;
  });
}

/** Seconds between the Unix epoch (1970-01-01) and the Ripple epoch (2000-01-01) */
const RIPPLE_EPOCH_OFFSET = 946684800;

export function rippleTimeToIso(rippleSeconds: number): string {
  return new Date((rippleSeconds + RIPPLE_EPOCH_OFFSET) * 1000).toISOString();
}

interface AccountInfoResult {
  account_data: { Balance: string };
}

export async function getAccountBalanceDrops(account: string): Promise<string> {
  const result = await rpc<AccountInfoResult>('account_info', { account, ledger_index: 'validated' });
  return result.account_data.Balance;
}

export interface XrplTxEntry {
  tx?: XrplTxJson;
  tx_json?: XrplTxJson;
  hash?: string;
  close_time_iso?: string;
  meta?: { delivered_amount?: unknown; TransactionResult?: string };
  validated?: boolean;
}

interface XrplTxJson {
  TransactionType?: string;
  Account?: string;
  Destination?: string;
  Amount?: unknown;
  Fee?: string;
  hash?: string;
  date?: number;
}

interface AccountTxResult {
  transactions: XrplTxEntry[];
  marker?: unknown;
}

/** Normalized view of one account_tx entry regardless of rippled vs Clio response shape */
export interface NormalizedXrplTx {
  hash: string;
  isoTimestamp: string | null;
  type: string;
  account: string;
  destination: string;
  /** delivered amount: string of drops for XRP, object for issued currencies */
  delivered: unknown;
  feeDrops: string | null;
  succeeded: boolean;
}

export function normalizeEntry(entry: XrplTxEntry): NormalizedXrplTx | null {
  const tx = entry.tx ?? entry.tx_json;
  if (!tx) return null;
  const hash = tx.hash ?? entry.hash ?? '';
  if (!hash) return null;

  const isoTimestamp =
    entry.close_time_iso ?? (typeof tx.date === 'number' ? rippleTimeToIso(tx.date) : null);

  const result = entry.meta?.TransactionResult;
  return {
    hash,
    isoTimestamp,
    type: tx.TransactionType ?? '',
    account: tx.Account ?? '',
    destination: tx.Destination ?? '',
    delivered: entry.meta?.delivered_amount ?? tx.Amount,
    feeDrops: typeof tx.Fee === 'string' ? tx.Fee : null,
    succeeded: entry.validated !== false && (result === undefined || result === 'tesSUCCESS'),
  };
}

export async function getAccountTx(account: string): Promise<NormalizedXrplTx[]> {
  const out: NormalizedXrplTx[] = [];
  let marker: unknown = undefined;

  for (let page = 0; page < 6; page++) {
    const res = await rpc<AccountTxResult>('account_tx', {
      account,
      ledger_index_min: -1,
      ledger_index_max: -1,
      binary: false,
      limit: 200,
      forward: false,
      ...(marker ? { marker } : {}),
    });
    for (const entry of res.transactions ?? []) {
      const n = normalizeEntry(entry);
      if (n) out.push(n);
    }
    if (!res.marker) break;
    marker = res.marker;
  }

  return out;
}
