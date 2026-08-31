import { cached, cacheKey } from '../cache';
import { ADDRESSES, BTC_TOKENS, CACHE_TTL_SECONDS, COINGECKO_IDS, COMBINED_BTC, type BtcTokenConfig } from '../config';
import * as coingecko from '../coingecko';
import type { Holding, Transaction } from '../types';
import { formatUnits } from '../units';
import { buildLotsAndDisposals, priceTransactions } from './accountingFromTxs';
import * as etherscan from './etherscanApi';
import * as nodeReal from './nodeRealApi';
import type { SourceLedgerData } from './types';

/**
 * The Bitcoin source: BTCB on BNB Chain + WBTC on Polygon + WBTC on Ethereum, all held by one
 * EVM address and all folded into a single "BTC" position. Each chain's transfer feed for its one
 * BTC-pegged contract is normalized to a BTC-denominated leg; every leg shares the synthetic
 * token key 'BTC', so holdings show one row and the cost-basis engine runs one pooled FIFO queue
 * across all three chains. Priced entirely off CoinGecko's `bitcoin` spot (WBTC/BTCB track BTC
 * ~1:1), current and historical.
 */

const NETWORK = 'bitcoin' as const;
const ADDRESS = ADDRESSES.bitcoin;

const BTC_TOKEN_PICK: Transaction['token'] = {
  symbol: COMBINED_BTC.symbol,
  contractAddress: COMBINED_BTC.contractAddress,
  isNative: false,
};

interface ChainTransfer {
  hash: string;
  timestamp: string;
  /** signed, in BTC units */
  amount: number;
  from: string;
  to: string;
  chainLabel: string;
  realSymbol: string;
  explorerUrl: string;
}

async function getChainTransfers(cfg: BtcTokenConfig): Promise<ChainTransfer[]> {
  if (cfg.provider === 'nodereal') {
    const transfers = await nodeReal.getErc20Transfers(ADDRESS, cfg.contract);
    return transfers.flatMap((t) => {
      if (t.value === null || t.value === undefined) return [];
      const direction = (t.to ?? '').toLowerCase() === ADDRESS ? 1 : -1;
      const magnitude = formatUnits(String(t.value), cfg.decimals);
      if (magnitude === 0) return [];
      return [
        {
          hash: t.hash,
          timestamp: t.metadata?.blockTimestamp ?? new Date().toISOString(),
          amount: direction * magnitude,
          from: t.from,
          to: t.to ?? ADDRESS,
          chainLabel: cfg.chainLabel,
          realSymbol: t.asset ?? cfg.symbol,
          explorerUrl: cfg.explorerTx(t.hash),
        },
      ];
    });
  }

  const txs = await etherscan.getTokenTxList(cfg.chainId!, ADDRESS, cfg.contract);
  return txs.flatMap((t) => {
    const direction = t.to.toLowerCase() === ADDRESS ? 1 : -1;
    const magnitude = formatUnits(t.value, Number(t.tokenDecimal));
    if (magnitude === 0) return [];
    return [
      {
        hash: t.hash,
        timestamp: new Date(Number(t.timeStamp) * 1000).toISOString(),
        amount: direction * magnitude,
        from: t.from,
        to: t.to,
        chainLabel: cfg.chainLabel,
        realSymbol: t.tokenSymbol || cfg.symbol,
        explorerUrl: cfg.explorerTx(t.hash),
      },
    ];
  });
}

async function getRawTransfers(): Promise<ChainTransfer[]> {
  return cached(cacheKey('rawwallet', ADDRESS, NETWORK), CACHE_TTL_SECONDS.transactions, async () => {
    const perChain = await Promise.all(BTC_TOKENS.map(getChainTransfers));
    return perChain.flat().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  });
}

function toTransactions(raw: ChainTransfer[]): Transaction[] {
  return raw.map((t) => ({
    hash: t.hash,
    network: NETWORK,
    timestamp: t.timestamp,
    type: t.amount > 0 ? ('receive' as const) : ('send' as const),
    token: BTC_TOKEN_PICK,
    from: t.from,
    to: t.to,
    amount: t.amount,
    gasUsedNative: 0,
    gasUsedUsd: null,
    methodLabel: null,
    subLabel: `${t.realSymbol} · ${t.chainLabel}`,
    explorerUrl: t.explorerUrl,
  }));
}

export async function resolveHistoricalPrice(_token: Transaction['token'], isoTimestamp: string): Promise<number | null> {
  const dateStr = new Date(isoTimestamp).toISOString().slice(0, 10);
  return cached(cacheKey('histprice', COINGECKO_IDS.bitcoin, dateStr), CACHE_TTL_SECONDS.historicalPrice, () =>
    coingecko.getHistoricalPrice(COINGECKO_IDS.bitcoin, new Date(isoTimestamp)),
  );
}

async function getHoldings(raw: ChainTransfer[]): Promise<Holding[]> {
  const balance = raw.reduce((sum, t) => sum + t.amount, 0);
  const price = await cached(cacheKey('price', COINGECKO_IDS.bitcoin), CACHE_TTL_SECONDS.currentPrice, () =>
    coingecko.getCurrentPrice(COINGECKO_IDS.bitcoin),
  );

  return [
    {
      token: {
        contractAddress: COMBINED_BTC.contractAddress,
        symbol: COMBINED_BTC.symbol,
        name: 'Bitcoin (BTCB + WBTC)',
        decimals: 8,
        isNative: false,
        coingeckoId: COINGECKO_IDS.bitcoin,
        network: NETWORK,
      },
      balance: String(balance),
      balanceFormatted: balance,
      priceUsd: price.usd,
      valueUsd: balance * price.usd,
      change24hPct: price.usd24hChange,
    },
  ];
}

export async function getNetworkLedgerData(): Promise<SourceLedgerData> {
  const raw = await getRawTransfers();
  const transactions = toTransactions(raw);
  const holdings = await getHoldings(raw);
  const pricedTransactions = await priceTransactions(transactions, resolveHistoricalPrice);
  const { lots, disposals } = buildLotsAndDisposals(pricedTransactions);

  return { holdings, transactions, lots, disposals, pricedTransactions };
}
