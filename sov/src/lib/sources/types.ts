import type { Disposal, Lot } from '../accounting/types';
import type { Holding, Transaction } from '../types';

export interface PricedTransaction extends Transaction {
  /** Historical USD price per unit at the transaction's timestamp, or null if unresolvable (excluded from cost-basis lots) */
  priceUsd: number | null;
}

/** The common shape every source module normalizes its raw API data into, consumed uniformly by ledger.ts */
export interface SourceLedgerData {
  holdings: Holding[];
  transactions: Transaction[];
  lots: Lot[];
  disposals: Disposal[];
  /** Same transactions with historical USD pricing attached, reused for the portfolio-value-over-time chart */
  pricedTransactions: PricedTransaction[];
}
