import type { CostBasisStrategy, Lot, LotConsumption } from './types';

/**
 * Pools all remaining lots for a token into a single weighted-average cost per unit (and a
 * quantity-weighted average acquisition date, used only for the short/long-term split - the IRS
 * doesn't formally recognize average cost for crypto, so this is a best-effort approximation).
 * Depletes the underlying lots oldest-first so remainingQuantity bookkeeping stays consistent
 * for later disposals.
 */
export const averageStrategy: CostBasisStrategy = {
  method: 'average',
  consume(lots: Lot[], quantity: number): LotConsumption[] {
    const available = lots.filter((l) => l.remainingQuantity > 0);
    const totalQuantity = available.reduce((sum, l) => sum + l.remainingQuantity, 0);
    if (totalQuantity <= 0) return [];

    const totalCost = available.reduce((sum, l) => sum + l.remainingQuantity * l.costBasisUsdPerUnit, 0);
    const avgCostPerUnit = totalCost / totalQuantity;

    const totalAcquiredMs = available.reduce(
      (sum, l) => sum + l.remainingQuantity * new Date(l.acquiredAt).getTime(),
      0,
    );
    const avgAcquiredAt = new Date(totalAcquiredMs / totalQuantity).toISOString();

    const take = Math.min(totalQuantity, quantity);

    const ordered = [...available].sort((a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime());
    let remaining = take;
    for (const lot of ordered) {
      if (remaining <= 0) break;
      const drain = Math.min(lot.remainingQuantity, remaining);
      lot.remainingQuantity -= drain;
      remaining -= drain;
    }

    return [{ lotId: 'average-pool', quantity: take, costBasisUsdPerUnit: avgCostPerUnit, acquiredAt: avgAcquiredAt }];
  },
};
