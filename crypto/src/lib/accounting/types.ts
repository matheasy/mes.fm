export type CostBasisMethod = 'fifo' | 'lifo' | 'average';

export interface GainResult {
  /** sov/ai/mfa's own NetworkId, as a plain string - this app only ever displays it, never branches on it */
  network: string;
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
