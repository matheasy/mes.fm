import type { WalletKey } from './wallets';
import type { AcbDisposal, AcbHolding, AcbStats } from './tax/acb';

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
  /** Taxes page only: what the units with unknown cost on this row actually cost you, in CAD (overrides the $0) */
  costCad?: number | null;
  updatedAt: string;
}

/** Label tags that mean "this left for another account of mine", not a sale - see lib/tax/acb.ts */
export const TRANSFER_TAGS = ['personal transfer'];

export function isTransferLabel(label: LabelRecord | null | undefined): boolean {
  return !!label && TRANSFER_TAGS.includes(label.tag.trim().toLowerCase());
}

/** One disposition row on the Taxes page: the ACB calculation's result plus its source's name/link and label */
export interface TaxRow extends AcbDisposal {
  sourceLabel: string;
  sourceLink: string;
  label: LabelRecord | null;
  /** Still needs the owner: a send nobody has labelled yet, or units at an unknown ($0) cost with no cost entered */
  needsInput: ('send' | 'unknown-cost')[];
}

/** Income for the year by kind (claimed Hive rewards, HBD interest, ...) */
export interface TaxIncomeSummary {
  totalCad: number;
  totalUsd: number;
  byKind: { kind: string; asset: string; count: number; quantity: number; cad: number; usd: number }[];
}

/** Receipts from outside accounts that aren't recognisable income, by sender - for the owner to judge */
export interface TaxReceiptsSummary {
  totalCad: number;
  bySender: { counterparty: string; source: string; asset: string; count: number; cad: number }[];
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
  key: string;
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
  income: TaxIncomeSummary;
  receipts: TaxReceiptsSummary;
  /** Rows of the year still needing the owner (see TaxRow.needsInput) */
  needsInput: { sends: number; unknownCost: number };
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
