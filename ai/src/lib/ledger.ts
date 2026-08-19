import type { Disposal, Lot } from './accounting/types';
import { cached, cacheKey } from './cache';
import { CACHE_TTL_SECONDS, NATIVE_TOKEN, WALLET_ADDRESS } from './config';
import * as coingecko from './coingecko';
import * as moralis from './moralis';
import type { Holding, Transaction } from './types';
import { gasFeeBnb, weiToBnb } from './units';

interface RawWalletData {
  nativeBalanceWei: string;
  tokenBalances: moralis.MoralisTokenBalance[];
  history: moralis.MoralisHistoryTx[];
}

async function getRawWalletData(): Promise<RawWalletData> {
  const key = cacheKey('rawwallet', WALLET_ADDRESS);
  return cached(key, CACHE_TTL_SECONDS.transactions, async () => {
    const [nativeBalanceWei, tokenBalances, history] = await Promise.all([
      moralis.getNativeBalanceWei(WALLET_ADDRESS),
      moralis.getTokenBalances(WALLET_ADDRESS),
      moralis.getWalletHistory(WALLET_ADDRESS),
    ]);
    return { nativeBalanceWei, tokenBalances, history };
  });
}

/**
 * Flattens Moralis's decoded per-tx history (which groups native + BEP-20 transfers under one
 * tx, already categorized) into one signed row per token movement. A tx categorized "token
 * swap" is trusted directly rather than re-derived from transfer directions.
 */
export function normalizeTransactions(raw: RawWalletData): Transaction[] {
  const wallet = WALLET_ADDRESS;
  const txs: Transaction[] = [];

  for (const tx of raw.history) {
    const timestamp = new Date(tx.block_timestamp).toISOString();
    const isSwap = tx.category === 'token swap';
    const gasUsedBnb = gasFeeBnb(tx.receipt_gas_used, tx.gas_price);
    let gasAttributed = false;

    for (const nt of tx.native_transfers) {
      const direction = nt.direction === 'receive' ? 1 : -1;
      txs.push({
        hash: tx.hash,
        timestamp,
        type: isSwap ? 'swap' : direction > 0 ? 'receive' : 'send',
        token: { symbol: 'BNB', contractAddress: 'BNB', isNative: true },
        from: nt.from_address,
        to: nt.to_address,
        amount: direction * Number(nt.value_formatted),
        gasUsedBnb: gasAttributed ? 0 : gasUsedBnb,
        gasUsedUsd: null,
        methodLabel: tx.method_label,
      });
      gasAttributed = true;
    }

    for (const et of tx.erc20_transfers) {
      if (et.possible_spam) continue;
      const direction = et.to_address.toLowerCase() === wallet ? 1 : -1;
      txs.push({
        hash: tx.hash,
        timestamp,
        type: isSwap ? 'swap' : direction > 0 ? 'receive' : 'send',
        token: { symbol: et.token_symbol, contractAddress: et.address.toLowerCase(), isNative: false },
        from: et.from_address,
        to: et.to_address,
        amount: direction * Number(et.value_formatted),
        gasUsedBnb: gasAttributed ? 0 : gasUsedBnb,
        gasUsedUsd: null,
        methodLabel: tx.method_label,
      });
      gasAttributed = true;
    }

    if (!gasAttributed) {
      txs.push({
        hash: tx.hash,
        timestamp,
        type: 'contract',
        token: { symbol: 'BNB', contractAddress: 'BNB', isNative: true },
        from: wallet,
        to: wallet,
        amount: 0,
        gasUsedBnb,
        gasUsedUsd: null,
        methodLabel: tx.method_label,
      });
    }
  }

  return txs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getTransactions(): Promise<Transaction[]> {
  return normalizeTransactions(await getRawWalletData());
}

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

  for (const t of raw.tokenBalances) {
    const balanceFormatted = Number(t.balance_formatted);
    if (balanceFormatted <= 0) continue;

    holdings.push({
      token: {
        contractAddress: t.token_address.toLowerCase(),
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        isNative: false,
        coingeckoId: null,
      },
      balance: t.balance,
      balanceFormatted,
      priceUsd: t.usd_price,
      valueUsd: t.usd_value,
      change24hPct: t.usd_price_24hr_percent_change,
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
