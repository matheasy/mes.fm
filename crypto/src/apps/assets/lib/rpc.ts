import { fetchJson } from './http';

/**
 * Minimal EVM JSON-RPC over keyless public endpoints, with JSON-RPC *batching* (many eth_calls in
 * one HTTP round trip) and hand-rolled ABI encoding for the handful of view calls this app needs -
 * no ethers/viem dependency.
 */

export interface RpcCall {
  method: string;
  params: unknown[];
}

const BATCH_SIZE = 40;

/** A deterministic EVM failure (revert etc.) - retrying on another node can't change the answer */
const DETERMINISTIC = /revert|execution|invalid opcode|out of gas|invalid argument|stack/i;

/** One JSON-RPC batch against one endpoint. `retry` marks calls that failed for transport reasons (rate limit, node hiccup). */
async function batchOnce(url: string, calls: RpcCall[]): Promise<{ value: string | null; retry: boolean }[]> {
  const out: { value: string | null; retry: boolean }[] = [];
  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    const slice = calls.slice(i, i + BATCH_SIZE);
    const res = await fetchJson<{ id: number; result?: string; error?: { message?: string } }[] | { error?: unknown }>(url, {
      method: 'POST',
      body: slice.map((c, j) => ({ jsonrpc: '2.0', id: j, method: c.method, params: c.params })),
      retries: 1,
      timeoutMs: 15_000,
    });
    if (!Array.isArray(res)) throw new Error('RPC endpoint does not support batching');
    const byId = new Map(res.map((r) => [r.id, r]));
    for (let j = 0; j < slice.length; j++) {
      const r = byId.get(j);
      if (r && typeof r.result === 'string') out.push({ value: r.result, retry: false });
      else out.push({ value: null, retry: !(r?.error?.message && DETERMINISTIC.test(r.error.message)) });
    }
  }
  return out;
}

/**
 * Runs `calls` in JSON-RPC batches. Calls that fail for transport reasons are retried on the next
 * endpoint; deterministic reverts stay `null`. Results align with `calls`. Throws only if every
 * endpoint failed outright.
 */
export async function rpcBatch(urls: string[], calls: RpcCall[]): Promise<(string | null)[]> {
  return (await rpcBatchDetailed(urls, calls)).map((r) => r.value);
}

export interface RpcResult {
  value: string | null;
  /** True when the node answered with a deterministic EVM error (revert) - i.e. "no such thing", not an outage */
  reverted: boolean;
}

/** Like rpcBatch, but tells a revert apart from a call that never got an answer */
export async function rpcBatchDetailed(urls: string[], calls: RpcCall[]): Promise<RpcResult[]> {
  if (calls.length === 0) return [];
  const results: RpcResult[] = calls.map(() => ({ value: null, reverted: false }));
  let pending = calls.map((_, i) => i);
  let lastErr: unknown;
  let anyEndpointAnswered = false;

  for (const url of urls) {
    if (pending.length === 0) break;
    try {
      const got = await batchOnce(url, pending.map((i) => calls[i]!));
      anyEndpointAnswered = true;
      const still: number[] = [];
      pending.forEach((idx, j) => {
        const g = got[j]!;
        if (g.value !== null) results[idx] = { value: g.value, reverted: false };
        else if (g.retry) still.push(idx);
        else results[idx] = { value: null, reverted: true };
      });
      pending = still;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!anyEndpointAnswered) throw lastErr instanceof Error ? lastErr : new Error('all RPC endpoints failed');
  return results;
}

export async function rpcOne(urls: string[], call: RpcCall): Promise<string | null> {
  return (await rpcBatch(urls, [call]))[0] ?? null;
}

// ---- ABI helpers -------------------------------------------------------------------------------

export const SEL = {
  balanceOf: '0x70a08231',
  decimals: '0x313ce567',
  symbol: '0x95d89b41',
  totalSupply: '0x18160ddd',
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  getReserves: '0x0902f1ac',
  tokenOfOwnerByIndex: '0x2f745c59',
  positions: '0x99fbab88',
  factory: '0xc45a0155',
  getPool: '0x1698ee82',
  slot0: '0x3850c7bd',
} as const;

export const pad32 = (hexNo0x: string) => hexNo0x.replace(/^0x/, '').toLowerCase().padStart(64, '0');
export const encAddr = (a: string) => pad32(a);
export const encUint = (n: bigint | number) => pad32(BigInt(n).toString(16));

export function ethCall(to: string, data: string): RpcCall {
  return { method: 'eth_call', params: [{ to, data }, 'latest'] };
}

/** 32-byte word `index` of an ABI-encoded return value as bigint */
export function word(hex: string | null, index: number): bigint | null {
  if (!hex || hex === '0x') return null;
  const body = hex.replace(/^0x/, '');
  const w = body.slice(index * 64, index * 64 + 64);
  if (w.length < 64) return null;
  return BigInt('0x' + w);
}

/** Signed 32-byte word (int24/int256) */
export function signedWord(hex: string | null, index: number): bigint | null {
  const v = word(hex, index);
  if (v === null) return null;
  return v >= 1n << 255n ? v - (1n << 256n) : v;
}

export function wordAddress(hex: string | null, index: number): string | null {
  const v = word(hex, index);
  if (v === null) return null;
  return '0x' + v.toString(16).padStart(40, '0');
}

/** Decodes an ABI `string` return (or a bytes32-style symbol) */
export function decodeString(hex: string | null): string | null {
  if (!hex || hex === '0x') return null;
  const body = hex.replace(/^0x/, '');
  try {
    if (body.length === 64) {
      // bytes32 symbols (MKR-style)
      return Buffer.from(body, 'hex').toString('utf8').replace(/\0+$/, '') || null;
    }
    const offset = Number(BigInt('0x' + body.slice(0, 64))) * 2;
    const len = Number(BigInt('0x' + body.slice(offset, offset + 64))) * 2;
    return Buffer.from(body.slice(offset + 64, offset + 64 + len), 'hex').toString('utf8') || null;
  } catch {
    return null;
  }
}

/** bigint amount scaled to a JS number by `decimals` without overflowing intermediate Number() */
export function scale(amount: bigint, decimals: number): number {
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const div = 10n ** BigInt(decimals);
  const whole = abs / div;
  const frac = (abs % div).toString().padStart(decimals, '0');
  const n = Number(`${whole}.${frac || '0'}`);
  return neg ? -n : n;
}
