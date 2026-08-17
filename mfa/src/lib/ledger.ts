import type { Disposal, Lot } from './accounting/types';
import * as bscscan from './bscscan';
import { cached, cacheKey } from './cache';
import { CACHE_TTL_SECONDS, NATIVE_TOKEN, WALLET_ADDRESS } from './config';
import * as coingecko from './coingecko';
import type { Holding, Transaction } from './types';

interface RawWalletData {
  nativeBalanceWei: string;
  normalTxs: bscscan.BscScanNormalTx[];
  tokenTxs: bscscan.BscScanTokenTx[];
}

async function getRawWalletData(): Promise<RawWalletData> {
  const key = cacheKey('rawwallet', WALLET_ADDRESS);
  return cached(key, CACHE_TTL_SECONDS.transactions, async () => {
    const [nativeBalanceWei, normalTxs, tokenTxs] = await Promise.all([
      bscscan.getNativeBalanceWei(WALLET_ADDRESS),
      bscscan.getNormalTransactions(WALLET_ADDRESS),
      bscscan.getBep20TokenTransfers(WALLET_ADDRESS),
    ]);
    return { nativeBalanceWei, normalTxs, tokenTxs };
  });
}

/**
 * Merges BscScan's normal-tx list and BEP-20 transfer list into one chronological, signed
 * transaction feed. A tx hash carrying both an outgoing and incoming token transfer is
 * classified as a swap; plain 0-value contract calls with no token movement are dropped as noise.
 */
export function normalizeTransactions(raw: RawWalletData): Transaction[] {
  const wallet = WALLET_ADDRESS;
  const txs: Transaction[] = [];

  const transfersByHash = new Map<string, bscscan.BscScanTokenTx[]>();
  for (const t of raw.tokenTxs) {
    const list = transfersByHash.get(t.hash) ?? [];
    list.push(t);
    transfersByHash.set(t.hash, list);
  }

  for (const transfers of transfersByHash.values()) {
    const outgoing = transfers.some((t) => t.from.toLowerCase() === wallet);
    const incoming = transfers.some((t) => t.to.toLowerCase() === wallet);
    const isSwap = outgoing && incoming;

    for (const t of transfers) {
      const decimals = Number(t.tokenDecimal);
      const amount = bscscan.formatUnits(t.value, decimals);
      const direction = t.to.toLowerCase() === wallet ? 1 : -1;
      txs.push({
        hash: t.hash,
        timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(),
        type: isSwap ? 'swap' : direction > 0 ? 'receive' : 'send',
        token: { symbol: t.tokenSymbol, contractAddress: t.contractAddress.toLowerCase(), isNative: false },
        from: t.from,
        to: t.to,
        amount: direction * amount,
        gasUsedBnb: bscscan.gasFeeBnb(t.gasUsed, t.gasPrice),
        gasUsedUsd: null,
        methodLabel: isSwap ? 'Swap' : null,
      });
    }
  }

  for (const n of raw.normalTxs) {
    if (n.value === '0' && !n.functionName) continue;

    const direction = n.to?.toLowerCase() === wallet ? 1 : -1;
    const amount = bscscan.weiToBnb(n.value);
    txs.push({
      hash: n.hash,
      timestamp: new Date(Number(n.timeStamp) * 1000).toISOString(),
      type: n.functionName ? 'contract' : direction > 0 ? 'receive' : 'send',
      token: { symbol: 'BNB', contractAddress: 'BNB', isNative: true },
      from: n.from,
      to: n.to,
      amount: n.value === '0' ? 0 : direction * amount,
      gasUsedBnb: bscscan.gasFeeBnb(n.gasUsed, n.gasPrice),
      gasUsedUsd: null,
      methodLabel: n.functionName ? (n.functionName.split('(')[0] ?? null) : null,
    });
  }

  return txs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getTransactions(): Promise<Transaction[]> {
  return normalizeTransactions(await getRawWalletData());
}

export async function getCurrentHoldings(): Promise<Holding[]> {
  const raw = await getRawWalletData();
  const uniqueContracts = [...new Set(raw.tokenTxs.map((t) => t.contractAddress.toLowerCase()))];

  const [nativePrice, tokenBalances, tokenPrices] = await Promise.all([
    cached(cacheKey('price', 'native'), CACHE_TTL_SECONDS.currentPrice, () => coingecko.getNativeCurrentPrice()),
    Promise.all(
      uniqueContracts.map(async (contract) => ({
        contract,
        balance: await cached(cacheKey('balance', WALLET_ADDRESS, contract), CACHE_TTL_SECONDS.portfolio, () =>
          bscscan.getBep20TokenBalance(WALLET_ADDRESS, contract),
        ),
      })),
    ),
    cached(cacheKey('price', 'tokens', uniqueContracts.join(',') || 'none'), CACHE_TTL_SECONDS.currentPrice, () =>
      coingecko.getTokenCurrentPrices(uniqueContracts),
    ),
  ]);

  const holdings: Holding[] = [];
  const nativeBalance = bscscan.weiToBnb(raw.nativeBalanceWei);
  holdings.push({
    token: NATIVE_TOKEN,
    balance: raw.nativeBalanceWei,
    balanceFormatted: nativeBalance,
    priceUsd: nativePrice.usd,
    valueUsd: nativeBalance * nativePrice.usd,
    change24hPct: nativePrice.usd24hChange,
  });

  for (const { contract, balance } of tokenBalances) {
    const meta = raw.tokenTxs.find((t) => t.contractAddress.toLowerCase() === contract);
    if (!meta) continue;

    const decimals = Number(meta.tokenDecimal);
    const balanceFormatted = bscscan.formatUnits(balance, decimals);
    if (balanceFormatted <= 0) continue;

    const price = tokenPrices[contract];
    holdings.push({
      token: {
        contractAddress: contract,
        symbol: meta.tokenSymbol,
        name: meta.tokenName,
        decimals,
        isNative: false,
        coingeckoId: null,
      },
      balance,
      balanceFormatted,
      priceUsd: price?.usd ?? null,
      valueUsd: price ? balanceFormatted * price.usd : null,
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

/**
 * Builds acquisition lots and disposals for the accounting engine from the transaction feed.
 * Gas paid in BNB is not itself treated as a disposal event (a documented MVP simplification -
 * see README) - only outbound sends/swaps of a token count as disposing of it.
 */
export async function buildLotsAndDisposals(): Promise<{ lots: Lot[]; disposals: Disposal[] }> {
  const transactions = await getTransactions();
  const lots: Lot[] = [];
  const disposals: Disposal[] = [];

  for (const tx of transactions) {
    if (tx.amount === 0) continue;

    const priceUsd = await getHistoricalPriceForToken(tx.token, tx.timestamp);
    if (priceUsd === null) continue;

    if (tx.amount > 0) {
      lots.push({
        id: `${tx.hash}-${tx.token.contractAddress}`,
        txHash: tx.hash,
        tokenSymbol: tx.token.symbol,
        acquiredAt: tx.timestamp,
        quantity: tx.amount,
        remainingQuantity: tx.amount,
        costBasisUsdPerUnit: priceUsd,
      });
    } else {
      disposals.push({
        txHash: tx.hash,
        tokenSymbol: tx.token.symbol,
        disposedAt: tx.timestamp,
        quantity: -tx.amount,
        proceedsUsdPerUnit: priceUsd,
      });
    }
  }

  return { lots, disposals };
}
