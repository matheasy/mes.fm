const DEFAULT_WALLET = '0xaeF8A5Ab45652Bc612B2cE72B0631C9E052404A5';

export const WALLET_ADDRESS = (process.env.WALLET_ADDRESS ?? DEFAULT_WALLET).toLowerCase();

/** BNB Smart Chain mainnet chain id, used as the Etherscan-V2 `chainid` param */
export const BSC_CHAIN_ID = 56;

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
  portfolio: 5 * 60,
  transactions: 10 * 60,
  currentPrice: 2 * 60,
  historicalPrice: 30 * 24 * 60 * 60,
} as const;
