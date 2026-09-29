import { LONG_TERM_THRESHOLD_DAYS } from '../config';
import { averageStrategy } from './average';
import { fifoStrategy } from './fifo';
import { lifoStrategy } from './lifo';
import type { CostBasisMethod, CostBasisStrategy, Disposal, GainResult, Lot, UnrealizedGain } from './types';

const strategies: Record<CostBasisMethod, CostBasisStrategy> = {
  fifo: fifoStrategy,
  lifo: lifoStrategy,
  average: averageStrategy,
};

export function getStrategy(method: CostBasisMethod): CostBasisStrategy {
  return strategies[method];
}

function daysBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / (1000 * 60 * 60 * 24);
}

interface LedgerResult {
  gains: GainResult[];
  /** Lots with remainingQuantity updated after every disposal has been applied */
  remainingLots: Lot[];
}

/** Replays every disposal against the lot history, in chronological order, via the given cost-basis method */
function runLedger(lots: Lot[], disposals: Disposal[], method: CostBasisMethod): LedgerResult {
  const strategy = getStrategy(method);
  const workingLots = lots.map((lot) => ({ ...lot, remainingQuantity: lot.quantity }));
  const sortedDisposals = [...disposals].sort(
    (a, b) => new Date(a.disposedAt).getTime() - new Date(b.disposedAt).getTime(),
  );

  const gains: GainResult[] = [];

  for (const disposal of sortedDisposals) {
    const eligibleLots = workingLots.filter(
      (l) =>
        l.tokenSymbol === disposal.tokenSymbol &&
        l.remainingQuantity > 0 &&
        new Date(l.acquiredAt).getTime() <= new Date(disposal.disposedAt).getTime(),
    );

    for (const consumption of strategy.consume(eligibleLots, disposal.quantity)) {
      const holdingDays = daysBetween(consumption.acquiredAt, disposal.disposedAt);
      gains.push({
        tokenSymbol: disposal.tokenSymbol,
        disposalTxHash: disposal.txHash,
        disposedAt: disposal.disposedAt,
        acquiredAt: consumption.acquiredAt,
        quantity: consumption.quantity,
        proceedsUsd: consumption.quantity * disposal.proceedsUsdPerUnit,
        costBasisUsd: consumption.quantity * consumption.costBasisUsdPerUnit,
        gainUsd: consumption.quantity * (disposal.proceedsUsdPerUnit - consumption.costBasisUsdPerUnit),
        term: holdingDays >= LONG_TERM_THRESHOLD_DAYS ? 'long' : 'short',
        taxYear: new Date(disposal.disposedAt).getUTCFullYear(),
      });
    }
  }

  return { gains, remainingLots: workingLots };
}

export function computeRealizedGains(lots: Lot[], disposals: Disposal[], method: CostBasisMethod): GainResult[] {
  return runLedger(lots, disposals, method).gains;
}

export function computeUnrealizedGains(
  lots: Lot[],
  disposals: Disposal[],
  method: CostBasisMethod,
  currentPricesBySymbol: Record<string, number>,
): UnrealizedGain[] {
  const { remainingLots } = runLedger(lots, disposals, method);

  const byToken = new Map<string, Lot[]>();
  for (const lot of remainingLots) {
    if (lot.remainingQuantity <= 0) continue;
    const list = byToken.get(lot.tokenSymbol) ?? [];
    list.push(lot);
    byToken.set(lot.tokenSymbol, list);
  }

  const out: UnrealizedGain[] = [];
  for (const [tokenSymbol, tokenLots] of byToken) {
    const quantity = tokenLots.reduce((sum, l) => sum + l.remainingQuantity, 0);
    const costBasisUsd = tokenLots.reduce((sum, l) => sum + l.remainingQuantity * l.costBasisUsdPerUnit, 0);
    const currentValueUsd = quantity * (currentPricesBySymbol[tokenSymbol] ?? 0);
    out.push({ tokenSymbol, quantity, costBasisUsd, currentValueUsd, gainUsd: currentValueUsd - costBasisUsd });
  }
  return out;
}
