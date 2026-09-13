import type { Disposal, Lot } from './accounting/types';
import { cached, cacheKey } from './cache';
import { CACHE_TTL_SECONDS, NATIVE_TOKEN, WALLET_ADDRESS } from './config';
import * as coingecko from './coingecko';
import * as nodeReal from './nodeReal';
import type { Holding, Token, Transaction } from './types';
import { formatUnits, weiToBnb } from './units';

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
  const key = cacheKey('rawwallet', WALLET_ADDRESS);
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
 * pre-grouped/categorized per tx like Moralis was) and classifies each group: a single leg is a
 * send/receive, a hash with both a debit and a credit leg is a swap. Gas isn't shown here (0 for
 * every row) - nr_getAssetTransfers doesn't return gas, and fetching a receipt per unique tx hash
 * would multiply request volume against an unconfirmed free tier; a documented regression vs. the
 * old Moralis-based gas display, not silently dropped (same tradeoff the mes.fm/ai tracker made
 * for its own BSC support).
 */
export function normalizeTransactions(raw: RawWalletData): Transaction[] {
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
        timestamp: entry.timestamp,
        type: isSwap ? 'swap' : leg.amount > 0 ? 'receive' : 'send',
        token: leg.token,
        from: leg.from,
        to: leg.to,
        amount: leg.amount,
        gasUsedBnb: 0,
        gasUsedUsd: null,
        methodLabel: null,
      });
    }
  }

  return txs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getTransactions(): Promise<Transaction[]> {
  return normalizeTransactions(await getRawWalletData());
}

/** No bulk balance endpoint on NodeReal's free tier either - current BEP-20 holdings are derived by summing the fetched transfer history */
export async function getCurrentHoldings(): Promise<Holding[]> {
  const raw = await getRawWalletData();

  const nativePrice = await cached(cacheKey('price', 'native'), CACHE_TTL_SECONDS.currentPrice, () =>
    coingecko.getNativeCurrentPrice(),
  );

  const holdings: Holding[] = [];
  const nativeBalance = weiToBnb(raw.nativeBalanceWei);
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
        },
        balance: amount,
      });
    }
  }

  for (const { token, balance } of balances.values()) {
    if (balance <= 1e-12) continue; // filters out both zero and floating-point dust from summation

    const coinId = await resolveCoinId(token as Transaction['token']);
    const price = coinId
      ? await cached(cacheKey('price', coinId), CACHE_TTL_SECONDS.currentPrice, () => coingecko.getCurrentPrice(coinId))
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
  if (token.isNative) return 'binancecoin';
  return cached(cacheKey('coinid', token.contractAddress), CACHE_TTL_SECONDS.historicalPrice, () =>
    coingecko.resolveCoinIdByContract(token.contractAddress),
  );
}

export async function getHistoricalPriceForToken(token: Transaction['token'], isoTimestamp: string): Promise<number | null> {
  const coinId = await resolveCoinId(token);
  if (!coinId) return null;

  const date = new Date(isoTimestamp);
  const dateStr = date.toISOString().slice(0, 10);
  return cached(cacheKey('histprice', coinId, dateStr), CACHE_TTL_SECONDS.historicalPrice, () =>
    coingecko.getHistoricalPrice(coinId, date),
  );
}

interface PricedTransaction extends Transaction {
  priceUsd: number | null;
}

/** Attaches each non-zero transaction's historical USD price - shared by the gains engine and the value-history chart */
async function getPricedTransactions(): Promise<PricedTransaction[]> {
  const transactions = await getTransactions();
  const priced: PricedTransaction[] = [];

  for (const tx of transactions) {
    if (tx.amount === 0) {
      priced.push({ ...tx, priceUsd: null });
      continue;
    }
    priced.push({ ...tx, priceUsd: await getHistoricalPriceForToken(tx.token, tx.timestamp) });
  }

  return priced;
}

/**
 * Builds acquisition lots and disposals for the accounting engine from the transaction feed.
 * Gas paid in BNB is not itself treated as a disposal event (a documented MVP simplification -
 * see README) - only outbound sends/swaps of a token count as disposing of it.
 */
export async function buildLotsAndDisposals(): Promise<{ lots: Lot[]; disposals: Disposal[] }> {
  const priced = await getPricedTransactions();
  const lots: Lot[] = [];
  const disposals: Disposal[] = [];

  for (const tx of priced) {
    if (tx.amount === 0 || tx.priceUsd === null) continue;

    if (tx.amount > 0) {
      lots.push({
        id: `${tx.hash}-${tx.token.contractAddress}`,
        txHash: tx.hash,
        tokenSymbol: tx.token.symbol,
        acquiredAt: tx.timestamp,
        quantity: tx.amount,
        remainingQuantity: tx.amount,
        costBasisUsdPerUnit: tx.priceUsd,
      });
    } else {
      disposals.push({
        txHash: tx.hash,
        tokenSymbol: tx.token.symbol,
        disposedAt: tx.timestamp,
        quantity: -tx.amount,
        proceedsUsdPerUnit: tx.priceUsd,
      });
    }
  }

  return { lots, disposals };
}

export interface PortfolioValuePoint {
  timestamp: string;
  totalValueUsd: number;
}

/**
 * Reconstructs portfolio value over time from the transaction feed: walks transactions
 * chronologically, tracking cumulative balance per token and each token's last-known price
 * (reusing the same historical price already fetched for the gains engine, so this adds no
 * extra CoinGecko calls), and reports total value after each event. The final point is anchored
 * to the actual live portfolio value so the right edge of the chart reflects current prices even
 * when no token's own last transaction was recent.
 */
export async function getPortfolioValueHistory(): Promise<PortfolioValuePoint[]> {
  const priced = await getPricedTransactions();
  const chronological = priced
    .filter((tx): tx is PricedTransaction & { priceUsd: number } => tx.amount !== 0 && tx.priceUsd !== null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const balances = new Map<string, number>();
  const lastPrice = new Map<string, number>();
  const points: PortfolioValuePoint[] = [];

  for (const tx of chronological) {
    const symbol = tx.token.symbol;
    balances.set(symbol, (balances.get(symbol) ?? 0) + tx.amount);
    lastPrice.set(symbol, tx.priceUsd);

    let total = 0;
    for (const [sym, bal] of balances) {
      if (bal <= 0) continue;
      total += bal * (lastPrice.get(sym) ?? 0);
    }
    points.push({ timestamp: tx.timestamp, totalValueUsd: total });
  }

  const holdings = await getCurrentHoldings();
  const currentTotal = holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
  points.push({ timestamp: new Date().toISOString(), totalValueUsd: currentTotal });

  return points;
}
