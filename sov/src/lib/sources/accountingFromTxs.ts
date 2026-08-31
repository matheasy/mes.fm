import type { Disposal, Lot } from '../accounting/types';
import type { Transaction } from '../types';
import type { PricedTransaction } from './types';

/**
 * Shared by every source (Bitcoin, XRP, TGLD): attaches each non-zero transaction's historical
 * USD price, then turns the priced feed into cost-basis lots/disposals. A *received* amount
 * becomes a lot whose cost basis per unit is the asset's market price at that moment - i.e. the
 * value of the acquisition itself, never zero. A *sent* amount becomes a disposal priced the
 * same way. Same engine the ai/ and mfa/ trackers use.
 */
export async function priceTransactions(
  transactions: Transaction[],
  resolveHistoricalPrice: (token: Transaction['token'], isoTimestamp: string) => Promise<number | null>,
): Promise<PricedTransaction[]> {
  const priced: PricedTransaction[] = [];

  for (const tx of transactions) {
    if (tx.amount === 0) {
      priced.push({ ...tx, priceUsd: null });
      continue;
    }
    priced.push({ ...tx, priceUsd: await resolveHistoricalPrice(tx.token, tx.timestamp) });
  }

  return priced;
}

/**
 * A source can also hand back already-priced transactions (TGLD does, because its cost basis
 * comes from the HIVE actually paid on each Hive Engine market fill, not a date lookup). This
 * turns any priced feed into lots + disposals. Lot ids include the feed index so combined-BTC
 * legs that share a synthetic contract key never collide.
 */
export function buildLotsAndDisposals(priced: PricedTransaction[]): { lots: Lot[]; disposals: Disposal[] } {
  const lots: Lot[] = [];
  const disposals: Disposal[] = [];

  priced.forEach((tx, i) => {
    if (tx.amount === 0 || tx.priceUsd === null) return;

    if (tx.amount > 0) {
      lots.push({
        id: `${tx.network}-${tx.hash}-${i}`,
        txHash: tx.hash,
        network: tx.network,
        tokenSymbol: tx.token.symbol,
        contractAddress: tx.token.contractAddress,
        acquiredAt: tx.timestamp,
        quantity: tx.amount,
        remainingQuantity: tx.amount,
        costBasisUsdPerUnit: tx.priceUsd,
      });
    } else {
      disposals.push({
        txHash: tx.hash,
        network: tx.network,
        tokenSymbol: tx.token.symbol,
        contractAddress: tx.token.contractAddress,
        disposedAt: tx.timestamp,
        quantity: -tx.amount,
        proceedsUsdPerUnit: tx.priceUsd,
      });
    }
  });

  return { lots, disposals };
}
