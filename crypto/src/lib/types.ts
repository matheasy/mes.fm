import type { WalletKey } from './wallets';

export interface Token {
  /** 'BNB' for the native coin, otherwise the checksummed BEP-20 contract address */
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
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

/** Shape returned by each upstream wallet app's own `/api/portfolio` */
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

/** A transaction merged in from one of the tracked wallets, tagged with which one */
export interface SourcedTransaction extends Transaction {
  wallet: WalletKey;
}

export interface TransactionFilters {
  wallet?: WalletKey;
  token?: string;
  type?: TransactionType;
  startDate?: string;
  endDate?: string;
}

export interface PortfolioValuePoint {
  timestamp: string;
  totalValueUsd: number;
}

/** One tracked wallet's contribution to the combined portfolio, plus a link to its own dashboard */
export interface WalletPortfolio {
  key: WalletKey;
  label: string;
  linkPath: string;
  wallet: string | null;
  totalValueUsd: number;
  change24hUsd: number;
  change24hPct: number;
  fetchedAt: string | null;
  error: string | null;
  rateLimited: boolean;
}

export interface CombinedPortfolio {
  totalValueUsd: number;
  change24hUsd: number;
  change24hPct: number;
  fetchedAt: string;
  wallets: WalletPortfolio[];
  /** Holdings merged across wallets by token symbol */
  holdings: Holding[];
}

export type ApiResult<T> =
  | { data: T; error?: never; rateLimited?: never }
  | { data?: never; error: string; rateLimited?: boolean };
