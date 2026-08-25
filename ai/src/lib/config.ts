import type { Token } from './types';

const DEFAULT_WALLET = '0x89aC35e57216A51Cf08f1c14B3Ce19D6813ee492';

export const WALLET_ADDRESS = (process.env.WALLET_ADDRESS ?? DEFAULT_WALLET).toLowerCase();

export type NetworkId = 'bsc' | 'ethereum' | 'arbitrum' | 'hyperliquid';

/** Iteration order used for "All Networks" aggregation and the network tab selector */
export const NETWORKS: NetworkId[] = ['bsc', 'ethereum', 'arbitrum', 'hyperliquid'];

export const NETWORK_LABELS: Record<NetworkId, string> = {
  bsc: 'BSC',
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  hyperliquid: 'Hyperliquid',
};

/** Etherscan's unified V2 API selects the chain via `chainid` on one shared API key */
export const ETHERSCAN_CHAIN_IDS: Record<'ethereum' | 'arbitrum', number> = {
  ethereum: 1,
  arbitrum: 42161,
};

export const NATIVE_TOKENS: Record<NetworkId, Token> = {
  bsc: { contractAddress: 'BNB', symbol: 'BNB', name: 'BNB', decimals: 18, isNative: true, coingeckoId: 'binancecoin', network: 'bsc' },
  ethereum: { contractAddress: 'ETH', symbol: 'ETH', name: 'Ethereum', decimals: 18, isNative: true, coingeckoId: 'ethereum', network: 'ethereum' },
  arbitrum: { contractAddress: 'ETH', symbol: 'ETH', name: 'Ethereum', decimals: 18, isNative: true, coingeckoId: 'ethereum', network: 'arbitrum' },
  // Represents the HyperEVM native gas token (HYPE), not a HyperCore asset - HyperCore itself has
  // no "native coin" balance in the EVM sense, see src/lib/networks/hyperevm.ts.
  hyperliquid: { contractAddress: 'HYPE', symbol: 'HYPE', name: 'Hyperliquid', decimals: 18, isNative: true, coingeckoId: 'hyperliquid', network: 'hyperliquid' },
};

export const EXPLORER_TX_URL: Record<NetworkId, (hash: string) => string> = {
  bsc: (hash) => `https://bscscan.com/tx/${hash}`,
  ethereum: (hash) => `https://etherscan.io/tx/${hash}`,
  arbitrum: (hash) => `https://arbiscan.io/tx/${hash}`,
  hyperliquid: (hash) => `https://app.hyperliquid.xyz/explorer/tx/${hash}`,
};

/** 1 year, used to split short-term vs long-term gains */
export const LONG_TERM_THRESHOLD_DAYS = 365;

export const CACHE_TTL_SECONDS = {
  transactions: 10 * 60,
  currentPrice: 2 * 60,
  historicalPrice: 30 * 24 * 60 * 60,
} as const;
