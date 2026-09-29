import type { NetworkId } from '../config';

export type CostBasisMethod = 'fifo' | 'lifo' | 'average';

export interface Lot {
  id: string;
  txHash: string;
  network: NetworkId;
  tokenSymbol: string;
  /** Contract address (or native sentinel) - lots/disposals match on this, not just symbol, so two
   *  different tokens that happen to share a symbol never share a FIFO queue. See engine.ts. */
  contractAddress: string;
  acquiredAt: string;
  quantity: number;
  remainingQuantity: number;
  costBasisUsdPerUnit: number;
}

export interface Disposal {
  txHash: string;
  network: NetworkId;
  tokenSymbol: string;
  contractAddress: string;
  disposedAt: string;
  quantity: number;
  proceedsUsdPerUnit: number;
}

export interface LotConsumption {
  lotId: string;
  quantity: number;
  costBasisUsdPerUnit: number;
  acquiredAt: string;
}

export interface GainResult {
  network: NetworkId;
  tokenSymbol: string;
  disposalTxHash: string;
  disposedAt: string;
  acquiredAt: string;
  quantity: number;
  proceedsUsd: number;
  costBasisUsd: number;
  gainUsd: number;
  term: 'short' | 'long';
  taxYear: number;
}

export interface UnrealizedGain {
  network: NetworkId;
  tokenSymbol: string;
  quantity: number;
  costBasisUsd: number;
  currentValueUsd: number;
  gainUsd: number;
}

export interface CostBasisStrategy {
  method: CostBasisMethod;
  /** Consumes up to `quantity` units from `lots` (mutating each lot's remainingQuantity) and reports how it was sourced */
  consume(lots: Lot[], quantity: number): LotConsumption[];
}
