import { BSC_CHAIN_ID } from './config';

/**
 * BscScan's standalone API key program now runs on Etherscan's multichain V2 API
 * (a BscScan-issued key from bscscan.com/apis still works here) - api.etherscan.io/v2
 * with chainid=56 selects BNB Smart Chain.
 */
const API_BASE = 'https://api.etherscan.io/v2/api';

function apiKey(): string {
  const key = process.env.BSCSCAN_API_KEY;
  if (!key) throw new Error('BSCSCAN_API_KEY is not set');
  return key;
}

async function call<T>(params: Record<string, string>): Promise<T> {
  const url = new URL(API_BASE);
  url.searchParams.set('chainid', String(BSC_CHAIN_ID));
  url.searchParams.set('apikey', apiKey());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`BscScan request failed: ${res.status}`);

  const json = (await res.json()) as { status: string; message: string; result: T };
  // BscScan returns status "0" both for genuine errors and for "no records found" - only
  // treat it as fatal when result isn't a (possibly empty) list.
  if (json.status === '0' && !Array.isArray(json.result)) {
    throw new Error(`BscScan error: ${json.message || 'unknown error'}`);
  }
  return json.result;
}

export interface BscScanTokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
}

export interface BscScanNormalTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
  methodId: string;
  functionName: string;
}

export async function getNativeBalanceWei(address: string): Promise<string> {
  return call<string>({ module: 'account', action: 'balance', address, tag: 'latest' });
}

export async function getBep20TokenTransfers(address: string): Promise<BscScanTokenTx[]> {
  return call<BscScanTokenTx[]>({
    module: 'account',
    action: 'tokentx',
    address,
    sort: 'asc',
  });
}

export async function getNormalTransactions(address: string): Promise<BscScanNormalTx[]> {
  return call<BscScanNormalTx[]>({
    module: 'account',
    action: 'txlist',
    address,
    sort: 'asc',
  });
}

export async function getBep20TokenBalance(address: string, contractAddress: string): Promise<string> {
  return call<string>({
    module: 'account',
    action: 'tokenbalance',
    address,
    contractaddress: contractAddress,
    tag: 'latest',
  });
}

/**
 * Converts a raw integer amount in the smallest unit (e.g. wei) to a decimal number, without
 * going through `Number(bigint)` first - that loses precision above 2^53 wei, which ordinary
 * wallet balances (BNB has 18 decimals) regularly exceed.
 */
export function formatUnits(rawValue: string | bigint, decimals: number): number {
  const negative = typeof rawValue === 'string' ? rawValue.startsWith('-') : rawValue < 0n;
  const abs = (typeof rawValue === 'string' ? BigInt(rawValue) : rawValue) * (negative ? -1n : 1n);

  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(decimals, '0');
  const str = `${negative ? '-' : ''}${whole}.${fraction}`;
  return Number(str);
}

export function weiToBnb(wei: string): number {
  return formatUnits(wei, 18);
}

export function gasFeeBnb(gasUsed: string, gasPriceWei: string): number {
  const feeWei = BigInt(gasUsed) * BigInt(gasPriceWei);
  return formatUnits(feeWei, 18);
}
