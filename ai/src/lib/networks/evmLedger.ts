import type { Disposal, Lot } from '../accounting/types';
import type { Transaction } from '../types';
import type { PricedTransaction } from './types';

/**
 * Shared by every EVM-style network (BSC, Ethereum, Arbitrum): attaches each non-zero
 * transaction's historical USD price, then turns the priced feed into cost-basis lots/disposals.
 * Identical logic to the original single-network ledger.ts, just parameterized by a
 * network-specific historical-price resolver instead of hardcoding CoinGecko/BSC.
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

/** Gas paid in the native coin is shown in the transaction list but is not itself a taxable disposal (documented MVP simplification) */
export function buildLotsAndDisposals(priced: PricedTransaction[]): { lots: Lot[]; disposals: Disposal[] } {
  const lots: Lot[] = [];
  const disposals: Disposal[] = [];

  for (const tx of priced) {
    if (tx.amount === 0 || tx.priceUsd === null) continue;

    if (tx.amount > 0) {
      lots.push({
        id: `${tx.hash}-${tx.token.contractAddress}`,
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
  }

  return { lots, disposals };
}
