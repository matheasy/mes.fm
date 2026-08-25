import { RateLimitError } from '../errors';
import { createThrottle } from './rateLimit';

/**
 * Etherscan's unified V2 API (api.etherscan.io/v2/api) covers Ethereum, Arbitrum, and 60+ other
 * EVM chains under one Etherscan-issued API key, selected via `chainid` - the old separate
 * Arbiscan key/domain is deprecated. See src/lib/networks/etherscanNetwork.ts for the per-network
 * wrapper built on this client.
 */
const API_BASE = 'https://api.etherscan.io/v2/api';

function apiKey(): string {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) throw new Error('ETHERSCAN_API_KEY is not set');
  return key;
}

/**
 * Etherscan's free-tier rate limit is one shared budget across the whole account (not per-chain,
 * since the V2 unification), but Ethereum and Arbitrum fetch concurrently and each internally
 * paginates 2-3 endpoints at once - without this, a single "All Networks" page load bursts far
 * past the ~3-5 req/sec free-tier limit before any of it has a chance to get cached. Every
 * Etherscan call (both networks, every endpoint) is serialized through this one throttle.
 */
const throttle = createThrottle(300);

async function get<T>(chainId: number, params: Record<string, string>): Promise<T> {
  return throttle(async () => {
    const url = new URL(API_BASE);
    url.searchParams.set('chainid', String(chainId));
    url.searchParams.set('apikey', apiKey());
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Etherscan request failed: ${res.status}`);

    const json = (await res.json()) as { status: string; message: string; result: T };
    if (json.message === 'NOTOK') {
      const resultText = typeof json.result === 'string' ? json.result : '';
      if (/rate limit|max (calls|rate)/i.test(resultText)) throw new RateLimitError('Etherscan rate limit reached');
      // "No transactions found" surfaces as status "0"/message "No transactions found", not "NOTOK" - only real errors land here
      throw new Error(`Etherscan request failed: ${resultText || json.message}`);
    }
    return json.result;
  });
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;

/** Spacing between pages comes from the shared throttle in get() now - no need to sleep here too */
async function paginate<T>(chainId: number, params: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await get<T[]>(chainId, { ...params, page: String(page), offset: String(PAGE_SIZE) });
    out.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

export async function getNativeBalanceWei(chainId: number, address: string): Promise<string> {
  return get<string>(chainId, { module: 'account', action: 'balance', address, tag: 'latest' });
}

export interface EtherscanNormalTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
  functionName: string;
}

/** Native ETH sends/receives + gas, paginated up to MAX_PAGES * PAGE_SIZE most-relevant records */
export async function getNormalTxList(chainId: number, address: string): Promise<EtherscanNormalTx[]> {
  const txs = await paginate<EtherscanNormalTx>(chainId, {
    module: 'account',
    action: 'txlist',
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
  });
  return txs.filter((t) => t.isError === '0');
}

export interface EtherscanTokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  contractAddress: string;
  value: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
}

/** ERC-20 transfer history, paginated - free tier has no bulk "current balances" endpoint, so balances are derived by summing this */
export async function getTokenTxList(chainId: number, address: string): Promise<EtherscanTokenTx[]> {
  return paginate<EtherscanTokenTx>(chainId, {
    module: 'account',
    action: 'tokentx',
    address,
    startblock: '0',
    endblock: '99999999',
    sort: 'desc',
  });
}
