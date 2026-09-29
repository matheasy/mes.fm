import { cached, cacheKey } from '../cache';
import { CACHE_TTL_SECONDS, NATIVE_TOKENS } from '../config';
import { currentWallet } from '../walletContext';
import * as coingecko from '../coingecko';
import type { Holding, Token, Transaction } from '../types';
import { formatUnits } from '../units';
import * as nodeReal from './nodeRealApi';
import { buildLotsAndDisposals, priceTransactions } from './evmLedger';
import type { NetworkLedgerData } from './types';

const NETWORK = 'bsc' as const;
const NATIVE_TOKEN = NATIVE_TOKENS.bsc;

interface Leg {
  token: Transaction['token'];
  from: string;
  to: string;
  amount: number;
}

interface RawWalletData {
  nativeBalanceWei: string;
  transfers: nodeReal.AssetTransfer[];
}

async function getRawWalletData(): Promise<RawWalletData> {
  const key = cacheKey('rawwallet', currentWallet().address, NETWORK);
  return cached(key, CACHE_TTL_SECONDS.transactions, async () => {
    const [nativeBalanceWei, transfers] = await Promise.all([
      nodeReal.getNativeBalanceWei(currentWallet().address),
      nodeReal.getAssetTransfers(currentWallet().address),
    ]);
    return { nativeBalanceWei, transfers };
  });
}

function decodeDecimals(d: string | null | undefined): number {
  if (!d) return 18;
  const n = d.startsWith('0x') ? parseInt(d, 16) : Number(d);
  return Number.isFinite(n) ? n : 18;
}

/** nr_getAssetTransfers' `value` is hex, in raw integer units: scale by decimals (18 for BNB, `decimal` for BEP-20) */
function transferAmount(t: nodeReal.AssetTransfer, isNative: boolean): number {
  const decimals = isNative ? 18 : decodeDecimals(t.decimal);
  let raw: bigint;
  try {
    raw = BigInt(t.value);
  } catch {
    return 0;
  }
  return formatUnits(raw.toString(), decimals);
}

/**
 * Groups nr_getAssetTransfers results by tx hash (it returns one flat list of transfer legs, not
 * pre-grouped per tx like Moralis was) and classifies each group the same way as the Etherscan-
 * family networks: a single leg is a send/receive, a hash with both a debit and a credit leg is a
 * swap. Gas isn't shown here (0 for every row) - nr_getAssetTransfers doesn't return gas, and
 * fetching a receipt per unique tx hash would multiply request volume against an unconfirmed free
 * tier; a documented regression vs. the old Moralis-based BSC gas display, not silently dropped.
 */
function normalizeTransactions(raw: RawWalletData): Transaction[] {
  const wallet = currentWallet().address;
  const nativeTokenPick: Transaction['token'] = { symbol: 'BNB', contractAddress: 'BNB', isNative: true };
  const byHash = new Map<string, { timestamp: string; legs: Leg[] }>();

  for (const t of raw.transfers) {
    if (!t.blockTimeStamp) continue;
    const timestamp = new Date(t.blockTimeStamp * 1000).toISOString();
    const entry = byHash.get(t.hash) ?? { timestamp, legs: [] };
    const direction = (t.to ?? '').toLowerCase() === wallet ? 1 : -1;
    const isNative = t.category !== '20';

    const token: Transaction['token'] = isNative
      ? nativeTokenPick
      : { symbol: t.asset ?? '???', contractAddress: (t.contractAddress ?? '').toLowerCase(), isNative: false };

    const amount = transferAmount(t, isNative);
    if (amount === 0) continue;
    entry.legs.push({ token, from: t.from, to: t.to ?? wallet, amount: direction * amount });
    byHash.set(t.hash, entry);
  }

  const txs: Transaction[] = [];
  for (const [hash, entry] of byHash) {
    const isSwap = entry.legs.some((l) => l.amount > 0) && entry.legs.some((l) => l.amount < 0);
    for (const leg of entry.legs) {
      txs.push({
        hash,
        network: NETWORK,
        timestamp: entry.timestamp,
        type: isSwap ? 'swap' : leg.amount > 0 ? 'receive' : 'send',
        token: leg.token,
        from: leg.from,
        to: leg.to,
        amount: leg.amount,
        gasUsedNative: 0,
        gasUsedUsd: null,
        methodLabel: null,
      });
    }
  }

  return txs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/** No bulk balance endpoint here either - current BEP-20 holdings are derived by summing the fetched transfer history */
async function getCurrentHoldings(raw: RawWalletData): Promise<Holding[]> {
  // a current price that can't be fetched leaves that holding's value unknown - it must not fail the
  // whole network, whose transaction history (what mes.fm/taxes needs) doesn't depend on it
  const nativePrice = await cached(cacheKey('price', 'native', NETWORK), CACHE_TTL_SECONDS.currentPrice, () =>
    coingecko.getCurrentPrice(NATIVE_TOKEN.coingeckoId!),
  ).catch(() => null);

  const holdings: Holding[] = [];
  const nativeBalance = formatUnits(raw.nativeBalanceWei, 18);
  holdings.push({
    token: NATIVE_TOKEN,
    balance: raw.nativeBalanceWei,
    balanceFormatted: nativeBalance,
    priceUsd: nativePrice?.usd ?? null,
    valueUsd: nativePrice ? nativeBalance * nativePrice.usd : null,
    change24hPct: nativePrice?.usd24hChange ?? null,
  });

  const balances = new Map<string, { token: Token; balance: number }>();
  for (const t of raw.transfers) {
    if (t.category !== '20' || !t.contractAddress) continue;
    const contractAddress = t.contractAddress.toLowerCase();
    const direction = (t.to ?? '').toLowerCase() === currentWallet().address ? 1 : -1;
    const amount = direction * transferAmount(t, false);
    const existing = balances.get(contractAddress);
    if (existing) {
      existing.balance += amount;
    } else {
      balances.set(contractAddress, {
        token: {
          contractAddress,
          symbol: t.asset ?? '???',
          name: t.asset ?? '???',
          decimals: decodeDecimals(t.decimal),
          isNative: false,
          coingeckoId: null,
          network: NETWORK,
        },
        balance: amount,
      });
    }
  }

  for (const { token, balance } of balances.values()) {
    if (balance <= 1e-12) continue;

    const coinId = await resolveCoinId(token as Transaction['token']).catch(() => null);
    const price = coinId
      ? await cached(cacheKey('price', coinId, NETWORK), CACHE_TTL_SECONDS.currentPrice, () => coingecko.getCurrentPrice(coinId)).catch(() => null)
      : null;

    holdings.push({
      token,
      balance: balance.toString(),
      balanceFormatted: balance,
      priceUsd: price?.usd ?? null,
      valueUsd: price ? balance * price.usd : null,
      change24hPct: price?.usd24hChange ?? null,
    });
  }

  return holdings;
}

async function resolveCoinId(token: Transaction['token']): Promise<string | null> {
  if (token.isNative) return NATIVE_TOKEN.coingeckoId;
  // wrapped in an object so "not listed" (null) is cached too - otherwise every spam token is looked up again on every request
  const hit = await cached(cacheKey('coinid-v2', token.contractAddress, NETWORK), CACHE_TTL_SECONDS.historicalPrice, async () => ({
    id: await coingecko.resolveCoinIdByContract(token.contractAddress, coingecko.COINGECKO_PLATFORM.bsc),
  }));
  return hit.id;
}

/** BNB by its CoinGecko id; a BEP-20 token by its contract on DefiLlama first (see getTokenDailyPriceByContract), then by CoinGecko id */
export async function resolveHistoricalPrice(token: Transaction['token'], isoTimestamp: string): Promise<number | null> {
  const date = new Date(isoTimestamp);
  const dateStr = date.toISOString().slice(0, 10);
  if (!token.isNative && token.contractAddress) {
    // { p } so a "no confident price" answer (spam airdrops) is cached as well, not re-asked every request
    const byContract = await cached(cacheKey('ctprice', `bsc:${token.contractAddress}`, dateStr), CACHE_TTL_SECONDS.historicalPrice, async () => ({
      p: await coingecko.getTokenDailyPriceByContract('bsc', token.contractAddress, date),
    }));
    if (byContract.p !== null) return byContract.p;
  }

  const coinId = await resolveCoinId(token);
  if (!coinId) return null;
  return cached(cacheKey('histprice-v2', coinId, dateStr), CACHE_TTL_SECONDS.historicalPrice, () => coingecko.getHistoricalPrice(coinId, date));
}

export async function getNetworkLedgerData(): Promise<NetworkLedgerData> {
  const raw = await getRawWalletData();
  const [holdings, transactions] = await Promise.all([getCurrentHoldings(raw), Promise.resolve(normalizeTransactions(raw))]);
  const pricedTransactions = await priceTransactions(transactions, resolveHistoricalPrice);
  const { lots, disposals } = buildLotsAndDisposals(pricedTransactions);

  return { holdings, transactions, lots, disposals, pricedTransactions };
}
