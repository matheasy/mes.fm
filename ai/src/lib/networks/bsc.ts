import { cached, cacheKey } from '../cache';
import { CACHE_TTL_SECONDS, NATIVE_TOKENS, WALLET_ADDRESS } from '../config';
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
  const key = cacheKey('rawwallet', WALLET_ADDRESS, NETWORK);
  return cached(key, CACHE_TTL_SECONDS.transactions, async () => {
    const [nativeBalanceWei, transfers] = await Promise.all([
      nodeReal.getNativeBalanceWei(WALLET_ADDRESS),
      nodeReal.getAssetTransfers(WALLET_ADDRESS),
    ]);
    return { nativeBalanceWei, transfers };
  });
}

function decodeDecimals(hex: string | null | undefined): number {
  if (!hex) return 18;
  return hex.startsWith('0x') ? parseInt(hex, 16) : Number(hex);
}

/**
 * nr_getAssetTransfers's `value` is raw integer units (confirmed live: a 0.00166 BNB transfer
 * came back as `1660000000000000`), not decimal-adjusted like Alchemy's `alchemy_getAssetTransfers`
 * - despite this API's request params closely mirroring Alchemy's, its response convention
 * differs here. Always scale by decimals (18 for native, rawContract.decimal for BEP-20).
 */
function transferAmount(t: nodeReal.AssetTransfer, isNative: boolean): number {
  const decimals = isNative ? 18 : decodeDecimals(t.rawContract?.decimal);
  return formatUnits(String(t.value), decimals);
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
  const wallet = WALLET_ADDRESS;
  const nativeTokenPick: Transaction['token'] = { symbol: 'BNB', contractAddress: 'BNB', isNative: true };
  const byHash = new Map<string, { timestamp: string; legs: Leg[] }>();

  for (const t of raw.transfers) {
    if (t.value === null || Number(t.value) === 0) continue;
    const timestamp = t.metadata?.blockTimestamp ?? new Date().toISOString();
    const entry = byHash.get(t.hash) ?? { timestamp, legs: [] };
    const direction = (t.to ?? '').toLowerCase() === wallet ? 1 : -1;
    const isNative = t.category !== '20';

    const token: Transaction['token'] = isNative
      ? nativeTokenPick
      : { symbol: t.asset ?? '???', contractAddress: (t.rawContract?.address ?? '').toLowerCase(), isNative: false };

    entry.legs.push({ token, from: t.from, to: t.to ?? wallet, amount: direction * transferAmount(t, isNative) });
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
  const nativePrice = await cached(cacheKey('price', 'native', NETWORK), CACHE_TTL_SECONDS.currentPrice, () =>
    coingecko.getCurrentPrice(NATIVE_TOKEN.coingeckoId!),
  );

  const holdings: Holding[] = [];
  const nativeBalance = formatUnits(raw.nativeBalanceWei, 18);
  holdings.push({
    token: NATIVE_TOKEN,
    balance: raw.nativeBalanceWei,
    balanceFormatted: nativeBalance,
    priceUsd: nativePrice.usd,
    valueUsd: nativeBalance * nativePrice.usd,
    change24hPct: nativePrice.usd24hChange,
  });

  const balances = new Map<string, { token: Token; balance: number }>();
  for (const t of raw.transfers) {
    if (t.category !== '20' || t.value === null || !t.rawContract?.address) continue;
    const contractAddress = t.rawContract.address.toLowerCase();
    const direction = (t.to ?? '').toLowerCase() === WALLET_ADDRESS ? 1 : -1;
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
          decimals: decodeDecimals(t.rawContract.decimal),
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

    const coinId = await resolveCoinId(token as Transaction['token']);
    const price = coinId
      ? await cached(cacheKey('price', coinId, NETWORK), CACHE_TTL_SECONDS.currentPrice, () => coingecko.getCurrentPrice(coinId))
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
  return cached(cacheKey('coinid', token.contractAddress, NETWORK), CACHE_TTL_SECONDS.historicalPrice, () =>
    coingecko.resolveCoinIdByContract(token.contractAddress, coingecko.COINGECKO_PLATFORM.bsc),
  );
}

export async function resolveHistoricalPrice(token: Transaction['token'], isoTimestamp: string): Promise<number | null> {
  const coinId = await resolveCoinId(token);
  if (!coinId) return null;

  const dateStr = new Date(isoTimestamp).toISOString().slice(0, 10);
  return cached(cacheKey('histprice', coinId, dateStr), CACHE_TTL_SECONDS.historicalPrice, () =>
    coingecko.getHistoricalPrice(coinId, new Date(isoTimestamp)),
  );
}

export async function getNetworkLedgerData(): Promise<NetworkLedgerData> {
  const raw = await getRawWalletData();
  const [holdings, transactions] = await Promise.all([getCurrentHoldings(raw), Promise.resolve(normalizeTransactions(raw))]);
  const pricedTransactions = await priceTransactions(transactions, resolveHistoricalPrice);
  const { lots, disposals } = buildLotsAndDisposals(pricedTransactions);

  return { holdings, transactions, lots, disposals, pricedTransactions };
}
