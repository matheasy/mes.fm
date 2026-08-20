export type CostBasisMethod = 'fifo' | 'lifo' | 'average';

export interface GainResult {
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
  tokenSymbol: string;
  quantity: number;
  costBasisUsd: number;
  currentValueUsd: number;
  gainUsd: number;
}
