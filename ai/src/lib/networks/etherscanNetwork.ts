import { cached, cacheKey } from '../cache';
import { CACHE_TTL_SECONDS, ETHERSCAN_CHAIN_IDS, NATIVE_TOKENS, WALLET_ADDRESS } from '../config';
import * as coingecko from '../coingecko';
import type { Holding, Token, Transaction } from '../types';
import { formatUnits, gasFeeBnb } from '../units';
import * as etherscan from './etherscanApi';
import { buildLotsAndDisposals, priceTransactions } from './evmLedger';
import type { NetworkLedgerData } from './types';

type EtherscanNetworkId = 'ethereum' | 'arbitrum';

interface RawWalletData {
  nativeBalanceWei: string;
  normalTxs: etherscan.EtherscanNormalTx[];
  tokenTxs: etherscan.EtherscanTokenTx[];
}

interface Leg {
  token: Transaction['token'];
  from: string;
  to: string;
  amount: number;
}

/**
 * One client reused for both Ethereum and Arbitrum (Etherscan's V2 API unifies both under one
 * key/host, selected by chainid - see etherscanApi.ts). Structurally mirrors networks/bsc.ts, but
 * has to merge two separate endpoints (native txlist + ERC-20 tokentx) into per-tx groupings
 * itself, since Etherscan - unlike Moralis - doesn't pre-group/categorize transfers per tx.
 */
export function createEtherscanNetwork(network: EtherscanNetworkId) {
  const chainId = ETHERSCAN_CHAIN_IDS[network];
  const nativeToken = NATIVE_TOKENS[network];
  const platform = coingecko.COINGECKO_PLATFORM[network];
  const nativeTokenPick: Transaction['token'] = {
    symbol: nativeToken.symbol,
    contractAddress: nativeToken.contractAddress,
    isNative: true,
  };

  async function getRawWalletData(): Promise<RawWalletData> {
    const key = cacheKey('rawwallet', WALLET_ADDRESS, network);
    return cached(key, CACHE_TTL_SECONDS.transactions, async () => {
      const [nativeBalanceWei, normalTxs, tokenTxs] = await Promise.all([
        etherscan.getNativeBalanceWei(chainId, WALLET_ADDRESS),
        etherscan.getNormalTxList(chainId, WALLET_ADDRESS),
        etherscan.getTokenTxList(chainId, WALLET_ADDRESS),
      ]);
      return { nativeBalanceWei, normalTxs, tokenTxs };
    });
  }

  /**
   * Groups the two separate transfer feeds by tx hash, then classifies each group: a single leg
   * is a send/receive, multiple legs with both a debit and a credit is a swap, and gas is
   * attributed once per hash (only to txs we actually authored - a pure incoming transfer someone
   * else sent costs us no gas, unlike this wallet's own sends/swaps).
   */
  function normalizeTransactions(raw: RawWalletData): Transaction[] {
    const wallet = WALLET_ADDRESS;
    const byHash = new Map<string, { timestamp: string; gasUsedNative: number; legs: Leg[]; methodLabel: string | null }>();

    for (const t of raw.normalTxs) {
      const timestamp = new Date(Number(t.timeStamp) * 1000).toISOString();
      const entry = byHash.get(t.hash) ?? { timestamp, gasUsedNative: 0, legs: [], methodLabel: t.functionName || null };
      entry.gasUsedNative = gasFeeBnb(t.gasUsed, t.gasPrice);
      if (BigInt(t.value) !== 0n) {
        const direction = t.to.toLowerCase() === wallet ? 1 : -1;
        entry.legs.push({ token: nativeTokenPick, from: t.from, to: t.to, amount: direction * formatUnits(t.value, 18) });
      }
      byHash.set(t.hash, entry);
    }

    for (const t of raw.tokenTxs) {
      const timestamp = new Date(Number(t.timeStamp) * 1000).toISOString();
      const entry = byHash.get(t.hash) ?? { timestamp, gasUsedNative: 0, legs: [], methodLabel: null };
      const direction = t.to.toLowerCase() === wallet ? 1 : -1;
      entry.legs.push({
        token: { symbol: t.tokenSymbol, contractAddress: t.contractAddress.toLowerCase(), isNative: false },
        from: t.from,
        to: t.to,
        amount: direction * formatUnits(t.value, Number(t.tokenDecimal)),
      });
      byHash.set(t.hash, entry);
    }

    const txs: Transaction[] = [];
    for (const [hash, entry] of byHash) {
      if (entry.legs.length === 0) {
        txs.push({
          hash,
          network,
          timestamp: entry.timestamp,
          type: 'contract',
          token: nativeTokenPick,
          from: wallet,
          to: wallet,
          amount: 0,
          gasUsedNative: entry.gasUsedNative,
          gasUsedUsd: null,
          methodLabel: entry.methodLabel,
        });
        continue;
      }

      const isSwap = entry.legs.some((l) => l.amount > 0) && entry.legs.some((l) => l.amount < 0);
      let gasAttributed = false;
      for (const leg of entry.legs) {
        txs.push({
          hash,
          network,
          timestamp: entry.timestamp,
          type: isSwap ? 'swap' : leg.amount > 0 ? 'receive' : 'send',
          token: leg.token,
          from: leg.from,
          to: leg.to,
          amount: leg.amount,
          gasUsedNative: gasAttributed ? 0 : entry.gasUsedNative,
          gasUsedUsd: null,
          methodLabel: entry.methodLabel,
        });
        gasAttributed = true;
      }
    }

    return txs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /** No bulk balance endpoint on Etherscan's free tier - current holdings are derived by summing the fetched transfer history */
  async function getCurrentHoldings(raw: RawWalletData): Promise<Holding[]> {
    const nativePrice = await cached(cacheKey('price', 'native', network), CACHE_TTL_SECONDS.currentPrice, () =>
      coingecko.getCurrentPrice(nativeToken.coingeckoId!),
    );

    const holdings: Holding[] = [];
    const nativeBalance = formatUnits(raw.nativeBalanceWei, 18);
    holdings.push({
      token: nativeToken,
      balance: raw.nativeBalanceWei,
      balanceFormatted: nativeBalance,
      priceUsd: nativePrice.usd,
      valueUsd: nativeBalance * nativePrice.usd,
      change24hPct: nativePrice.usd24hChange,
    });

    const balances = new Map<string, { token: Token; balance: number }>();
    for (const t of raw.tokenTxs) {
      const contractAddress = t.contractAddress.toLowerCase();
      const direction = t.to.toLowerCase() === WALLET_ADDRESS ? 1 : -1;
      const amount = direction * formatUnits(t.value, Number(t.tokenDecimal));
      const existing = balances.get(contractAddress);
      if (existing) {
        existing.balance += amount;
      } else {
        balances.set(contractAddress, {
          token: {
            contractAddress,
            symbol: t.tokenSymbol,
            name: t.tokenName,
            decimals: Number(t.tokenDecimal),
            isNative: false,
            coingeckoId: null,
            network,
          },
          balance: amount,
        });
      }
    }

    for (const { token, balance } of balances.values()) {
      if (balance <= 1e-12) continue; // filters out both zero and floating-point dust from summation

      const coinId = await resolveCoinId(token);
      const price = coinId
        ? await cached(cacheKey('price', coinId, network), CACHE_TTL_SECONDS.currentPrice, () => coingecko.getCurrentPrice(coinId))
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
    if (token.isNative) return nativeToken.coingeckoId;
    return cached(cacheKey('coinid', token.contractAddress, network), CACHE_TTL_SECONDS.historicalPrice, () =>
      coingecko.resolveCoinIdByContract(token.contractAddress, platform),
    );
  }

  async function resolveHistoricalPrice(token: Transaction['token'], isoTimestamp: string): Promise<number | null> {
    const coinId = await resolveCoinId(token);
    if (!coinId) return null;

    const dateStr = new Date(isoTimestamp).toISOString().slice(0, 10);
    return cached(cacheKey('histprice', coinId, dateStr), CACHE_TTL_SECONDS.historicalPrice, () =>
      coingecko.getHistoricalPrice(coinId, new Date(isoTimestamp)),
    );
  }

  async function getNetworkLedgerData(): Promise<NetworkLedgerData> {
    const raw = await getRawWalletData();
    const [holdings, transactions] = await Promise.all([getCurrentHoldings(raw), Promise.resolve(normalizeTransactions(raw))]);
    const pricedTransactions = await priceTransactions(transactions, resolveHistoricalPrice);
    const { lots, disposals } = buildLotsAndDisposals(pricedTransactions);

    return { holdings, transactions, lots, disposals, pricedTransactions };
  }

  return { getNetworkLedgerData, resolveHistoricalPrice };
}
