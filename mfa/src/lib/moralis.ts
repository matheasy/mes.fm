const API_BASE = 'https://deep-index.moralis.io/api/v2.2';
const CHAIN = 'bsc';

function apiKey(): string {
  const key = process.env.MORALIS_API_KEY;
  if (!key) throw new Error('MORALIS_API_KEY is not set');
  return key;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set('chain', CHAIN);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: { 'X-API-Key': apiKey() }, next: { revalidate: 0 } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Moralis request failed: ${res.status} ${body}`.trim());
  }
  return res.json() as Promise<T>;
}

export async function getNativeBalanceWei(address: string): Promise<string> {
  const result = await get<{ balance: string }>(`/${address}/balance`);
  return result.balance;
}

export interface MoralisTokenBalance {
  token_address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  balance_formatted: string;
  usd_price: number | null;
  usd_price_24hr_percent_change: number | null;
  usd_value: number | null;
  possible_spam: boolean;
  native_token: boolean;
}

/** ERC20/BEP-20 balances for the wallet, with live USD pricing already attached */
export async function getTokenBalances(address: string): Promise<MoralisTokenBalance[]> {
  const result = await get<{ result: MoralisTokenBalance[] }>(`/wallets/${address}/tokens`);
  return result.result.filter((t) => !t.possible_spam && !t.native_token);
}

export interface MoralisNativeTransfer {
  from_address: string;
  to_address: string;
  value_formatted: string;
  direction: 'send' | 'receive';
}

export interface MoralisErc20Transfer {
  token_name: string;
  token_symbol: string;
  token_decimals: string;
  address: string;
  from_address: string;
  to_address: string;
  value_formatted: string;
  possible_spam: boolean;
}

export type MoralisTxCategory =
  | 'send'
  | 'receive'
  | 'token send'
  | 'token receive'
  | 'token swap'
  | 'contract interaction'
  | string;

export interface MoralisHistoryTx {
  hash: string;
  block_timestamp: string;
  category: MoralisTxCategory;
  method_label: string | null;
  gas_price: string;
  receipt_gas_used: string;
  native_transfers: MoralisNativeTransfer[];
  erc20_transfers: MoralisErc20Transfer[];
}

const MAX_HISTORY_PAGES = 5;

/** Fetches a wallet's full decoded transaction history, following cursor pagination up to a page cap */
export async function getWalletHistory(address: string): Promise<MoralisHistoryTx[]> {
  const txs: MoralisHistoryTx[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const result = await get<{ result: MoralisHistoryTx[]; cursor: string | null }>(`/wallets/${address}/history`, {
      order: 'DESC',
      limit: '100',
      ...(cursor ? { cursor } : {}),
    });
    txs.push(...result.result);
    if (!result.cursor) break;
    cursor = result.cursor;
  }

  return txs;
}
