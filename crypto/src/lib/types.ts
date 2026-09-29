import type { GainResult } from './accounting/types';
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

export interface SourcedGainResult extends GainResult {
  wallet: WalletKey;
}

/** A gains row's stable identity for labels (see lib/labels.ts) - a disposal tx hash alone can
 * cover several rows (one swap disposing several lots/symbols), so all of these together are needed. */
export function gainRowId(g: SourcedGainResult): string {
  return [g.wallet, g.network, g.disposalTxHash, g.tokenSymbol, g.disposedAt].join(':');
}

export interface LabelRecord {
  /** Free text - the UI offers a few common presets (Trade, Gift, Personal transfer, Income, Other) but this is never a closed enum */
  tag: string;
  notes: string;
  screenshotUrls: string[];
  updatedAt: string;
}

/** One realized-gain row for the Taxes page: tagged with its wallet/group, its own row id, CAD
 * amounts (see lib/cadRate.ts), and its label if one has been set (see lib/labels.ts) */
export interface TaxRow extends SourcedGainResult {
  id: string;
  walletLabel: string;
  /** Bank of Canada USD/CAD rate on acquiredAt's date (or the nearest earlier business day) */
  cadRateAcquired: number | null;
  /** Bank of Canada USD/CAD rate on disposedAt's date (or the nearest earlier business day) */
  cadRateDisposed: number | null;
  costBasisCad: number | null;
  proceedsCad: number | null;
  gainCad: number | null;
  label: LabelRecord | null;
}

export type ApiResult<T> =
  | { data: T; error?: never; rateLimited?: never }
  | { data?: never; error: string; rateLimited?: boolean };
