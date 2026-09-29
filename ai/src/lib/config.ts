import type { Token } from './types';

const DEFAULT_WALLET = '0x89aC35e57216A51Cf08f1c14B3Ce19D6813ee492';

export type WalletKey = 'ai' | 'main';

export interface WalletConfig {
  key: WalletKey;
  /** Lowercase EVM address (also used on Hyperliquid / HyperEVM) */
  address: string;
  /** Lowercase contract addresses left out of this wallet's holdings and ledger entirely */
  excludeContracts: ReadonlySet<string>;
}

/**
 * The wallets this app can report on - pick one per request with `?wallet=` (src/lib/walletContext.ts).
 * `ai` is the default and the only one the mes.fm/ai pages themselves show.
 * `main` (the Main wallet) is read by mes.fm/portfolio and mes.fm/taxes. Its BTC-pegged tokens
 * are excluded because mes.fm/sov already tracks exactly these two contracts on this address
 * (sov/src/lib/config.ts BTC_TOKENS, pooled as one BTC position) - counting them here as well
 * would double them in the combined views. Arbitrum WBTC isn't in sov, so it stays in.
 */
export const WALLETS: Record<WalletKey, WalletConfig> = {
  ai: {
    key: 'ai',
    address: (process.env.WALLET_ADDRESS ?? DEFAULT_WALLET).toLowerCase(),
    excludeContracts: new Set(),
  },
  main: {
    key: 'main',
    address: '0xe6c0634d02ae5f136500ac9428ed5d9576695ef9',
    excludeContracts: new Set([
      '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', // BTCB, BNB Chain
      '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // WBTC, Ethereum
    ]),
  },
};

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
