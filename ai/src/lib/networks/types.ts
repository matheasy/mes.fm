import type { Disposal, Lot } from '../accounting/types';
import type { Holding, Transaction } from '../types';

export interface PricedTransaction extends Transaction {
  /** Historical USD price per unit at the transaction's timestamp, or null if unresolvable (excluded from cost-basis lots) */
  priceUsd: number | null;
}

/** The common shape every per-network module normalizes its raw API data into, consumed uniformly by ledger.ts */
export interface NetworkLedgerData {
  holdings: Holding[];
  transactions: Transaction[];
  lots: Lot[];
  disposals: Disposal[];
  /** Same transactions with historical USD pricing attached, reused for the portfolio-value-over-time chart */
  pricedTransactions: PricedTransaction[];
}

export interface PerpPosition {
  coin: string;
  sizeUnits: number;
  entryPriceUsd: number;
  positionValueUsd: number;
  unrealizedPnlUsd: number;
  liquidationPriceUsd: number | null;
}

export interface PerpFill {
  coin: string;
  time: string;
  side: 'buy' | 'sell';
  sizeUnits: number;
  priceUsd: number;
  closedPnlUsd: number;
}

/**
 * Hyperliquid perpetuals P&L, kept structurally separate from the spot/EVM FIFO cost-basis
 * engine - perp PNL is mark-to-market and reported directly by Hyperliquid's API, not lot-based.
 * Informational only, not tax advice: whether/how perpetuals on an offshore DeFi platform receive
 * any particular tax treatment is not asserted here.
 */
export interface HyperliquidPerpSummary {
  accountEquityUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  positions: PerpPosition[];
  recentFills: PerpFill[];
}
