import { RateLimitError } from '../errors';
import { createThrottle } from './rateLimit';

/**
 * BSCTrace via NodeReal's MegaNode - the BNB Chain-endorsed, genuinely-free replacement for the
 * now-paid-only BscScan/Etherscan-V2 API on BSC (Moralis's free BSC tier also ended). Plain
 * JSON-RPC 2.0 over HTTP POST, API key embedded in the URL path (not a header/query param).
 *
 * IMPORTANT CAVEAT: NodeReal doesn't publish a full worked example of `nr_getAssetTransfers`'s
 * response shape, or documented free-tier rate limits, as of this writing. The shape assumed
 * below (`{ transfers: [...], pageToken }`, per-transfer `value`/`rawContract`/`metadata` fields)
 * is inferred from NodeReal's own migration-guide request example plus its close resemblance to
 * Alchemy's `alchemy_getAssetTransfers` (which it appears modeled on) - though it diverges from
 * Alchemy on at least one confirmed point: `value` is raw integer units, not decimal-adjusted
 * (see bsc.ts's transferAmount()), discovered from a live wrong-by-1e18 transaction amount in
 * production. Assume other fields could carry similar undocumented divergences until spot-checked
 * against more real data. `paginateTransfers()` throws a clear, isolated (per-network, not
 * app-wide - see ledger.ts) error if the response isn't shaped as expected at all, rather than
 * silently computing wrong balances/gains - but that only catches wrong *shape*, not wrong
 * *convention* within an otherwise-valid shape, as this bug demonstrated.
 */
const BASE_HOST = 'https://bsc-mainnet.nodereal.io/v1';

function baseUrl(): string {
  const key = process.env.NODEREAL_API_KEY;
  if (!key) throw new Error('NODEREAL_API_KEY is not set');
  return `${BASE_HOST}/${key}`;
}

let requestId = 0;

/** No published free-tier rate limit for NodeReal - throttled conservatively for the same reason as etherscanApi.ts's throttle */
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

export async function getNativeBalanceWei(address: string): Promise<string> {
  const hex = await rpc<string>('eth_getBalance', [address, 'latest']);
  return BigInt(hex).toString();
}

export interface AssetTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string | null;
  /** Raw integer units (confirmed live), NOT decimal-adjusted despite resembling Alchemy's API - scale by decimals before use, see bsc.ts's transferAmount() */
  value: number | string | null;
  asset: string | null;
  /** NodeReal's actual accepted/returned values are bare numbers for token standards, confirmed live: {external, internal, 20, 721, 1155, state, deposit, withdraw} */
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

/** Spacing between pages comes from the shared throttle in rpc() now - no need to sleep here too */
async function paginateTransfers(direction: 'fromAddress' | 'toAddress', address: string): Promise<AssetTransfer[]> {
  const out: AssetTransfer[] = [];
  let pageToken = '';

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await rpc<AssetTransfersResult>('nr_getAssetTransfers', [
      {
        [direction]: address,
        category: ['external', 'internal', '20'],
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

/** Fetches both directions (fromAddress and toAddress calls are separate per NodeReal/Alchemy-style APIs) and dedupes */
export async function getAssetTransfers(address: string): Promise<AssetTransfer[]> {
  const [outgoing, incoming] = await Promise.all([
    paginateTransfers('fromAddress', address),
    paginateTransfers('toAddress', address),
  ]);

  const seen = new Set<string>();
  const merged: AssetTransfer[] = [];
  for (const t of [...outgoing, ...incoming]) {
    const key = `${t.hash}-${t.category}-${t.rawContract?.address ?? ''}-${t.from}-${t.to}-${t.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
  }
  return merged;
}
