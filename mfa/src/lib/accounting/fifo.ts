import type { CostBasisStrategy, Lot, LotConsumption } from './types';

/** Consumes the oldest-acquired lots first */
export const fifoStrategy: CostBasisStrategy = {
  method: 'fifo',
  consume(lots: Lot[], quantity: number): LotConsumption[] {
    const ordered = [...lots].sort((a, b) => new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime());
    return consumeInOrder(ordered, quantity);
  },
};

export function consumeInOrder(orderedLots: Lot[], quantity: number): LotConsumption[] {
  const consumptions: LotConsumption[] = [];
  let remaining = quantity;

  for (const lot of orderedLots) {
    if (remaining <= 0) break;
    if (lot.remainingQuantity <= 0) continue;

    const take = Math.min(lot.remainingQuantity, remaining);
    lot.remainingQuantity -= take;
    remaining -= take;

    consumptions.push({
      lotId: lot.id,
      quantity: take,
      costBasisUsdPerUnit: lot.costBasisUsdPerUnit,
      acquiredAt: lot.acquiredAt,
    });
  }

  return consumptions;
}
