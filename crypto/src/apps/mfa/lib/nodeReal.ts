import { cached, cacheKey } from './cache';
import { RateLimitError } from './errors';
import { createThrottle } from './rateLimit';

/**
 * BSCTrace via NodeReal's MegaNode - the BNB Chain-endorsed, genuinely-free replacement for
 * Moralis, whose free BSC tier ended (Moralis now requires a paid plan to keep using this app's
 * usage level - see the "Moralis Free usage is paused" 401 this replaced). Plain JSON-RPC 2.0
 * over HTTP POST, API key embedded in the URL path (not a header/query param). Same provider and
 * client as the mes.fm/ai tracker's BSC support (src/lib/networks/nodeRealApi.ts there) and the
 * mes.fm/sov tracker's BTCB leg.
 *
 * The request/response format below was checked against live nr_getAssetTransfers output on
 * 2026-09-29 (see AssetTransfer). The earlier version guessed an Alchemy-style shape and got three
 * things wrong without any error: no `metadata.blockTimestamp` (every transaction was dated "now"),
 * no `rawContract` (tokens had no contract, so no price) and `pageToken`/`pageSize` instead of
 * `pageKey`/`maxCount` with no block range (only the newest slice of history ever came back).
 */
const BASE_HOST = 'https://bsc-mainnet.nodereal.io/v1';

function baseUrl(): string {
  const key = process.env.NODEREAL_API_KEY;
  if (!key) throw new Error('NODEREAL_API_KEY is not set');
  return `${BASE_HOST}/${key}`;
}

let requestId = 0;

/** No published free-tier rate limit for NodeReal - throttled conservatively, same as the ai/ and sov/ trackers */
const throttle = createThrottle('nodereal', 150);

/** A rate-limit reply is waited out and retried (backing off), so a long first read of a history doesn't fail halfway */
const RATE_LIMIT_RETRIES = 6;

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await rpcOnce<T>(method, params);
    } catch (err) {
      if (!(err instanceof RateLimitError) || attempt >= RATE_LIMIT_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

async function rpcOnce<T>(method: string, params: unknown[]): Promise<T> {
  return throttle(async () => {
    const res = await fetch(baseUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: ++requestId }),
      next: { revalidate: 0 },
    });
    if (res.status === 429) throw new RateLimitError('NodeReal (BSCTrace) rate limit reached');
    if (!res.ok) throw new Error(`NodeReal request failed: ${res.status}`);

    const json = (await res.json()) as { result?: T; error?: { code: number; message: string } };
    if (json.error) {
      if (/rate limit|too many requests/i.test(json.error.message)) {
        throw new RateLimitError('NodeReal (BSCTrace) rate limit reached');
      }
      throw new Error(`NodeReal error: ${json.error.message}`);
    }
    if (json.result === undefined) throw new Error('NodeReal returned no result');
    return json.result;
  });
}

export async function getNativeBalanceWei(address: string): Promise<string> {
  const hex = await rpc<string>('eth_getBalance', [address, 'latest']);
  return BigInt(hex).toString();
}

/**
 * One transfer leg, as nr_getAssetTransfers actually returns it (checked against live data
 * 2026-09-29 - the earlier Alchemy-style guesses `metadata.blockTimestamp` / `rawContract` /
 * `pageToken` don't exist, which is why every BNB Chain transaction was dated "now", tokens had no
 * contract address and only the latest page ever came back). Only the fields used are kept.
 */
export interface AssetTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string | null;
  /** Hex, raw integer units - scale by `decimal` (18 for BNB) */
  value: string;
  asset: string | null;
  /** 'external' | 'internal' (BNB) | '20' (BEP-20) */
  category: string;
  /** BEP-20 contract (the zero address for BNB) */
  contractAddress: string | null;
  /** BEP-20 decimals, as a string; absent for BNB */
  decimal: string | null;
  /** Unix seconds */
  blockTimeStamp: number;
  /** 0 = the transaction failed and moved nothing */
  receiptsStatus: number | null;
  /** position within the transaction, to tell apart several identical-looking legs */
  logIndex: number | null;
  traceIndex: number | null;
}

interface RawTransfer extends Partial<Omit<AssetTransfer, 'contractAddress' | 'decimal'>> {
  contractAddress?: string;
  decimal?: string;
}

/** nr_getAssetTransfers rejects any block range of 2,000,000 or more ("range must be less than 2000000") */
const WINDOW = 1_999_999;
/** A window this far behind the tip is final - cached for a year (it never changes) */
const FINALITY_BLOCKS = 1_000;
const WINDOW_TTL_SECONDS = 365 * 24 * 60 * 60;
const CONCURRENCY = 2;

function slim(t: RawTransfer): AssetTransfer {
  return {
    blockNum: String(t.blockNum ?? '0x0'),
    hash: String(t.hash ?? ''),
    from: String(t.from ?? '').toLowerCase(),
    to: t.to ? String(t.to).toLowerCase() : null,
    value: String(t.value ?? '0x0'),
    asset: t.asset ?? null,
    category: String(t.category ?? ''),
    contractAddress: t.contractAddress ? t.contractAddress.toLowerCase() : null,
    decimal: t.decimal ?? null,
    blockTimeStamp: Number(t.blockTimeStamp ?? 0),
    receiptsStatus: t.receiptsStatus ?? null,
    logIndex: t.logIndex ?? null,
    traceIndex: t.traceIndex ?? null,
  };
}

/** Every transfer in one block window for one direction, following `pageKey` (1,000 per page) */
async function windowTransfers(direction: 'fromAddress' | 'toAddress', address: string, fromBlock: number, toBlock: number): Promise<AssetTransfer[]> {
  const out: AssetTransfer[] = [];
  let pageKey = '';
  for (let page = 0; page < 100; page++) {
    const result = await rpc<{ transfers?: RawTransfer[]; pageKey?: string }>('nr_getAssetTransfers', [
      {
        category: ['external', 'internal', '20'],
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        [direction]: address,
        order: 'asc',
        maxCount: '0x3e8',
        ...(pageKey ? { pageKey } : {}),
      },
    ]);
    if (!result || !Array.isArray(result.transfers)) {
      throw new Error('NodeReal nr_getAssetTransfers returned an unexpected response shape');
    }
    out.push(...result.transfers.map(slim));
    if (!result.pageKey) return out;
    pageKey = result.pageKey;
  }
  throw new Error(`More than 100,000 BNB Chain transfers in blocks ${fromBlock}-${toBlock}`);
}

/**
 * The address's complete BNB Chain history (BNB, internal BNB and BEP-20, both directions), oldest
 * first. The chain is walked in fixed 2M-block windows from genesis; each finished window is cached
 * for a year, so after the first full read only the newest window is fetched again. A first read of
 * a long history can outlast one serverless request - the windows it finished stay cached and the
 * next request carries on. Failed transactions (receiptsStatus 0) are dropped.
 */
export async function getAssetTransfers(address: string): Promise<AssetTransfer[]> {
  const addr = address.toLowerCase();
  // nr_getAssetTransfers' index trails the chain head by a few blocks ("blockNum not reached" when
  // asked for the very latest block), so stop ~75 seconds short - the next refresh picks those up
  const latest = Number(BigInt(await rpc<string>('eth_blockNumber', []))) - 100;

  // Optional: skip the chain before this block (a wallet can't have history before it existed). Windows
  // stay on the same fixed grid either way, so the cache keys don't change.
  const fromBlock = Number(process.env.NODEREAL_FROM_BLOCK ?? 0) || 0;
  const firstWindow = Math.floor(fromBlock / (WINDOW + 1)) * (WINDOW + 1);

  const jobs: (() => Promise<AssetTransfer[]>)[] = [];
  for (let start = firstWindow; start <= latest; start += WINDOW + 1) {
    const end = Math.min(start + WINDOW, latest);
    const final = start + WINDOW <= latest - FINALITY_BLOCKS;
    for (const direction of ['fromAddress', 'toAddress'] as const) {
      const run = () => windowTransfers(direction, addr, start, end);
      jobs.push(final ? () => cached(cacheKey('nrwindow', addr, direction, start), WINDOW_TTL_SECONDS, run) : run);
    }
  }

  const results: AssetTransfer[][] = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]!();
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const seen = new Set<string>();
  const merged: AssetTransfer[] = [];
  for (const t of results.flat()) {
    if (t.receiptsStatus === 0) continue;
    const key = [t.hash, t.category, t.contractAddress ?? '', t.from, t.to ?? '', t.value, t.logIndex ?? '', t.traceIndex ?? ''].join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
  }
  return merged.sort((a, b) => a.blockTimeStamp - b.blockTimeStamp);
}
