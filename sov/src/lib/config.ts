import type { Token } from './types';

/**
 * MES Store of Value tracks three specific long-term holdings across three chains/ledgers, each
 * from one address. A "network" here is really a *source* - one of these three - not an EVM
 * network like the ai/ tracker. The BTC-pegged tokens on three EVM chains are deliberately folded
 * into a single synthetic "BTC" asset (see COMBINED_BTC) so holdings and cost-basis accounting
 * treat BTCB + WBTC as one position.
 */

export const ADDRESSES = {
  /** EVM address holding BTCB (BNB Chain) + WBTC (Polygon, Ethereum) */
  bitcoin: '0xe6c0634d02ae5f136500ac9428ed5d9576695ef9'.toLowerCase(),
  /** XRP Ledger classic address */
  xrp: 'rDqSZAsxSEBoTgPGDbSqKEtrEe4JxKkDNh',
  /** Hive account name (Hive Engine layer-2 balances are keyed by account, not an address) */
  hive: 'mes',
} as const;

export type NetworkId = 'bitcoin' | 'xrp' | 'tgld';

/** Iteration order for "All" aggregation and the source tab selector */
export const NETWORKS: NetworkId[] = ['bitcoin', 'xrp', 'tgld'];

export const NETWORK_LABELS: Record<NetworkId, string> = {
  bitcoin: 'Bitcoin',
  xrp: 'XRP',
  tgld: 'TGLD',
};

/**
 * Synthetic "native" token per source. Only used for the gas-symbol suffix in the transactions
 * table - SOV doesn't track gas for the EVM/Hive legs (noise for a buy-and-hold view), so the
 * only non-zero gas is the XRP ledger fee on sends.
 */
export const NATIVE_TOKENS: Record<NetworkId, Token> = {
  bitcoin: { contractAddress: 'BTC', symbol: 'BTC', name: 'Bitcoin', decimals: 8, isNative: true, coingeckoId: 'bitcoin', network: 'bitcoin' },
  xrp: { contractAddress: 'XRP', symbol: 'XRP', name: 'XRP', decimals: 6, isNative: true, coingeckoId: 'ripple', network: 'xrp' },
  tgld: { contractAddress: 'TGLD', symbol: 'TGLD', name: 'TGLD', decimals: 8, isNative: true, coingeckoId: null, network: 'tgld' },
};

/** Fallback per-source explorer; individual BTC transactions carry their own chain-correct `explorerUrl` */
export const EXPLORER_TX_URL: Record<NetworkId, (hash: string) => string> = {
  bitcoin: (hash) => `https://blockchair.com/search?q=${hash}`,
  xrp: (hash) => `https://xrpscan.com/tx/${hash}`,
  tgld: (hash) => `https://he.dtools.dev/tx/${hash}`,
};

/** The BTC-pegged ERC-20s tracked on each EVM chain, all combined into one BTC position. */
export interface BtcTokenConfig {
  chain: 'bsc' | 'polygon' | 'ethereum';
  chainLabel: string;
  symbol: string;
  contract: string;
  decimals: number;
  provider: 'nodereal' | 'etherscan';
  /** Etherscan V2 chainid, when provider === 'etherscan' */
  chainId?: number;
  explorerTx: (hash: string) => string;
}

export const BTC_TOKENS: BtcTokenConfig[] = [
  {
    chain: 'bsc',
    chainLabel: 'BNB Chain',
    symbol: 'BTCB',
    contract: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',
    decimals: 18,
    provider: 'nodereal',
    explorerTx: (hash) => `https://bscscan.com/tx/${hash}`,
  },
  {
    chain: 'polygon',
    chainLabel: 'Polygon',
    symbol: 'WBTC',
    contract: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
    decimals: 8,
    provider: 'etherscan',
    chainId: 137,
    explorerTx: (hash) => `https://polygonscan.com/tx/${hash}`,
  },
  {
    chain: 'ethereum',
    chainLabel: 'Ethereum',
    symbol: 'WBTC',
    contract: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
    decimals: 8,
    provider: 'etherscan',
    chainId: 1,
    explorerTx: (hash) => `https://etherscan.io/tx/${hash}`,
  },
];

/** The single asset every BTC-pegged token above is accounted as */
export const COMBINED_BTC = { symbol: 'BTC', contractAddress: 'BTC' } as const;

/** CoinGecko coin ids used for USD pricing */
export const COINGECKO_IDS = { bitcoin: 'bitcoin', xrp: 'ripple', hive: 'hive' } as const;

/** 1 year, used to split short-term vs long-term gains */
export const LONG_TERM_THRESHOLD_DAYS = 365;

export const CACHE_TTL_SECONDS = {
  transactions: 10 * 60,
  currentPrice: 2 * 60,
  historicalPrice: 30 * 24 * 60 * 60,
} as const;

/** XRP Ledger JSON-RPC endpoint. Default is the keyless community cluster; override if it's flaky. */
export const XRPL_RPC_URL = process.env.XRPL_RPC_URL ?? 'https://xrplcluster.com/';

/** Hive Engine contract-RPC node and account-history node (both keyless). */
export const HIVE_ENGINE_RPC_URL = process.env.HIVE_ENGINE_RPC_URL ?? 'https://api.hive-engine.com/rpc';
export const HIVE_ENGINE_HISTORY_URL = process.env.HIVE_ENGINE_HISTORY_URL ?? 'https://history.hive-engine.com';
