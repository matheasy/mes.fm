import { RateLimitError } from '../errors';
import { createThrottle } from './rateLimit';

/**
 * BSCTrace via NodeReal's MegaNode - the BNB Chain-endorsed, genuinely-free replacement for the
 * now-paid-only BscScan/Etherscan-V2 API on BSC. Plain JSON-RPC 2.0 over HTTP POST, API key in
 * the URL path. SOV uses just one call: `nr_getAssetTransfers` for BEP-20 transfers, filtered
 * client-side to the BTCB contract.
 *
 * CAVEAT (inherited from the ai/ tracker): NodeReal doesn't publish a full worked example of
 * `nr_getAssetTransfers`'s response shape. `value` is raw integer units, NOT decimal-adjusted
 * despite the Alchemy-style request params - always scale by decimals. `paginateTransfers()`
 * throws a clear, isolated error if the response isn't shaped as expected rather than computing
 * wrong balances.
 */
const BASE_HOST = 'https://bsc-mainnet.nodereal.io/v1';

function baseUrl(): string {
  const key = process.env.NODEREAL_API_KEY;
  if (!key) throw new Error('NODEREAL_API_KEY is not set');
  return `${BASE_HOST}/${key}`;
}

let requestId = 0;

const throttle = createThrottle('nodereal', 500);

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
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

export interface AssetTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string | null;
  /** Raw integer units (confirmed live), NOT decimal-adjusted - scale by decimals before use */
  value: number | string | null;
  asset: string | null;
  category: 'external' | 'internal' | '20' | string;
  rawContract: { address: string | null; decimal: string | null } | null;
  metadata?: { blockTimestamp?: string };
}

interface AssetTransfersResult {
  transfers: AssetTransfer[];
  pageToken?: string;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

async function paginateTransfers(direction: 'fromAddress' | 'toAddress', address: string): Promise<AssetTransfer[]> {
  const out: AssetTransfer[] = [];
  let pageToken = '';

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await rpc<AssetTransfersResult>('nr_getAssetTransfers', [
      {
        [direction]: address,
        category: ['20'],
        withMetadata: true,
        excludeZeroValue: false,
        pageSize: PAGE_SIZE,
        pageToken,
      },
    ]);

    if (!result || !Array.isArray(result.transfers)) {
      throw new Error('NodeReal nr_getAssetTransfers returned an unexpected response shape (see nodeRealApi.ts caveat)');
    }

    out.push(...result.transfers);
    if (!result.pageToken || result.transfers.length < PAGE_SIZE) break;
    pageToken = result.pageToken;
  }

  return out;
}

/** BEP-20 transfers for `address` involving `contractAddress`, both directions, deduped */
export async function getErc20Transfers(address: string, contractAddress: string): Promise<AssetTransfer[]> {
  const wanted = contractAddress.toLowerCase();
  const [outgoing, incoming] = await Promise.all([
    paginateTransfers('fromAddress', address),
    paginateTransfers('toAddress', address),
  ]);

  const seen = new Set<string>();
  const merged: AssetTransfer[] = [];
  for (const t of [...outgoing, ...incoming]) {
    if ((t.rawContract?.address ?? '').toLowerCase() !== wanted) continue;
    const key = `${t.hash}-${t.from}-${t.to}-${t.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
  }
  return merged;
}
