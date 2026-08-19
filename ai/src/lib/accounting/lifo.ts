import type { CostBasisStrategy, Lot, LotConsumption } from './types';
import { consumeInOrder } from './fifo';

/** Consumes the most-recently-acquired lots first */
export const lifoStrategy: CostBasisStrategy = {
  method: 'lifo',
  consume(lots: Lot[], quantity: number): LotConsumption[] {
    const ordered = [...lots].sort((a, b) => new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime());
    return consumeInOrder(ordered, quantity);
  },
};
