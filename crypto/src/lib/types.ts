import type { AcbDisposal, AcbHolding, AcbStats } from './tax/acb';
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

export interface LabelRecord {
  /** Free text - the UI offers a few common presets (Trade, Gift, Personal transfer, Income, Other) but this is never a closed enum */
  tag: string;
  notes: string;
  screenshotUrls: string[];
  updatedAt: string;
}

/** Label tags that mean "this left for another account of mine", not a sale - see lib/tax/acb.ts */
export const TRANSFER_TAGS = ['personal transfer'];

export function isTransferLabel(label: LabelRecord | null | undefined): boolean {
  return !!label && TRANSFER_TAGS.includes(label.tag.trim().toLowerCase());
}

/** One disposition row on the Taxes page: the ACB calculation's result plus its wallet name and label */
export interface TaxRow extends AcbDisposal {
  walletLabel: string;
  label: LabelRecord | null;
}

export interface TaxAssetSummary {
  asset: string;
  count: number;
  quantity: number;
  proceedsCad: number;
  costCad: number;
  gainCad: number;
}

/** One tax year's totals (transfers excluded) - what goes on Schedule 3 */
export interface TaxYearSummary {
  year: number;
  count: number;
  proceedsCad: number;
  costCad: number;
  gainCad: number;
  proceedsUsd: number;
  costUsd: number;
  gainUsd: number;
  /** Rows with units the history never shows arriving (their cost counted as 0) */
  uncoveredCount: number;
  byAsset: TaxAssetSummary[];
}

export interface TaxSourceStatus {
  key: WalletKey;
  label: string;
  entries: number;
  error: string | null;
}

export interface TaxesResponse {
  /** Tax years that have dispositions, newest first */
  years: number[];
  /** The year the rows below are for */
  year: number;
  summary: TaxYearSummary;
  rows: TaxRow[];
  /** Units and ACB left in each pool today, across all wallets */
  holdings: AcbHolding[];
  stats: AcbStats;
  sources: TaxSourceStatus[];
  /** False when a Bank of Canada rate couldn't be found for some date (CAD figures then partly missing) */
  cadComplete: boolean;
}

/** mes.fm/assets' totals, as passed on by /api/assets (groups' totals include dust) */
export interface AssetsTotal {
  fetchedAt: string;
  /** Everything worth $10+ (mes.fm/assets' default view) */
  totalUsd: number;
  /** Everything, dust included */
  totalAllUsd: number;
  groups: { key: string; label: string; totalUsd: number }[];
}

export type ApiResult<T> =
  | { data: T; error?: never; rateLimited?: never }
  | { data?: never; error: string; rateLimited?: boolean };
