export interface Token {
  /** 'BNB' for the native coin, otherwise the checksummed BEP-20 contract address */
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  /** CoinGecko coin id, resolved lazily and cached; null if unresolved */
  coingeckoId: string | null;
}

export interface Holding {
  token: Token;
  balance: string;
  balanceFormatted: number;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
}

export interface PortfolioSummary {
  wallet: string;
  totalValueUsd: number;
  change24hUsd: number;
  change24hPct: number;
  holdings: Holding[];
  fetchedAt: string;
}

export type TransactionType = 'send' | 'receive' | 'swap' | 'contract';

export interface Transaction {
  hash: string;
  timestamp: string;
  type: TransactionType;
  token: Pick<Token, 'symbol' | 'contractAddress' | 'isNative'>;
  from: string;
  to: string;
  /** Signed: positive = received, negative = sent, in token units */
  amount: number;
  gasUsedBnb: number;
  gasUsedUsd: number | null;
  methodLabel: string | null;
}

export interface TransactionFilters {
  token?: string;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
}

export type ApiResult<T> =
  | { data: T; error?: never; rateLimited?: never }
  | { data?: never; error: string; rateLimited?: boolean };
