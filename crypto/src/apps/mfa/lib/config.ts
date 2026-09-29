const DEFAULT_WALLET = '0xaeF8A5Ab45652Bc612B2cE72B0631C9E052404A5';

// MFA_WALLET_ADDRESS, not WALLET_ADDRESS: one app serves both trackers now, and the AI Trading one has its own
export const WALLET_ADDRESS = (process.env.MFA_WALLET_ADDRESS ?? DEFAULT_WALLET).toLowerCase();

export const NATIVE_TOKEN = {
  contractAddress: 'BNB',
  symbol: 'BNB',
  name: 'BNB',
  decimals: 18,
  isNative: true,
  coingeckoId: 'binancecoin',
} as const;

/** 1 year, used to split short-term vs long-term gains */
export const LONG_TERM_THRESHOLD_DAYS = 365;

export const CACHE_TTL_SECONDS = {
  transactions: 10 * 60,
  currentPrice: 2 * 60,
  historicalPrice: 30 * 24 * 60 * 60,
} as const;
