const DEFAULT_WALLET = '0x89aC35e57216A51Cf08f1c14B3Ce19D6813ee492';

export const WALLET_ADDRESS = (process.env.WALLET_ADDRESS ?? DEFAULT_WALLET).toLowerCase();

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
