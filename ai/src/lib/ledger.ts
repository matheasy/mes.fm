import type { Disposal, Lot } from './accounting/types';
import { NETWORKS, type NetworkId } from './config';
import { describeNetworkError } from './errors';
import * as arbitrum from './networks/arbitrum';
import * as bsc from './networks/bsc';
import * as ethereum from './networks/ethereum';
import * as hyperliquid from './networks/hyperliquid';
import type { NetworkLedgerData, PricedTransaction } from './networks/types';
import type { Holding, NetworkError, Transaction } from './types';

const NETWORK_MODULES: Record<NetworkId, { getNetworkLedgerData: () => Promise<NetworkLedgerData>; resolveHistoricalPrice: (token: Transaction['token'], isoTimestamp: string) => Promise<number | null> }> = {
  bsc,
  ethereum,
  arbitrum,
  hyperliquid,
};

export { getPerpSummary as getHyperliquidPerpSummary } from './networks/hyperliquid';

function networksToFetch(network?: NetworkId): NetworkId[] {
  return network ? [network] : NETWORKS;
}

export interface AggregatedNetworkData {
  byNetwork: Partial<Record<NetworkId, NetworkLedgerData>>;
  networkErrors: Partial<Record<NetworkId, NetworkError>>;
}

/**
 * Fetches every requested network's ledger data independently via Promise.allSettled - one
 * network being slow/rate-limited/down never blocks or blanks out the others. Callers combine
 * `byNetwork` (whatever succeeded) with `networkErrors` (per-network failure reasons) to render
 * partial results instead of an all-or-nothing failure.
 */
export async function getAggregatedNetworkData(network?: NetworkId): Promise<AggregatedNetworkData> {
  const targets = networksToFetch(network);
  const settled = await Promise.allSettled(targets.map((n) => NETWORK_MODULES[n].getNetworkLedgerData()));

  const byNetwork: Partial<Record<NetworkId, NetworkLedgerData>> = {};
  const networkErrors: Partial<Record<NetworkId, NetworkError>> = {};

  settled.forEach((result, i) => {
    const n = targets[i]!; // settled is mapped 1:1 from targets, so every index is in bounds
    if (result.status === 'fulfilled') {
      byNetwork[n] = result.value;
    } else {
      networkErrors[n] = describeNetworkError(result.reason, `Failed to load ${n} data`);
    }
  });

  return { byNetwork, networkErrors };
}

export async function getCurrentHoldings(network?: NetworkId): Promise<{ holdings: Holding[]; networkErrors: AggregatedNetworkData['networkErrors'] }> {
  const { byNetwork, networkErrors } = await getAggregatedNetworkData(network);
  const holdings = Object.values(byNetwork).flatMap((d) => d!.holdings);
  return { holdings, networkErrors };
}

export async function getTransactions(network?: NetworkId): Promise<{ transactions: Transaction[]; networkErrors: AggregatedNetworkData['networkErrors'] }> {
  const { byNetwork, networkErrors } = await getAggregatedNetworkData(network);
  const transactions = Object.values(byNetwork)
    .flatMap((d) => d!.transactions)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return { transactions, networkErrors };
}

export interface NetworkLots {
  network: NetworkId;
  lots: Lot[];
  disposals: Disposal[];
}

/** Per-network lots/disposals, kept separate (never merged) - each network's FIFO/LIFO/average queue is its own ledger */
export async function buildLotsAndDisposalsByNetwork(
  network?: NetworkId,
): Promise<{ byNetwork: NetworkLots[]; networkErrors: AggregatedNetworkData['networkErrors'] }> {
  const { byNetwork, networkErrors } = await getAggregatedNetworkData(network);
  const result = Object.entries(byNetwork).map(([n, d]) => ({
    network: n as NetworkId,
    lots: d!.lots,
    disposals: d!.disposals,
  }));
  return { byNetwork: result, networkErrors };
}

export async function getHistoricalPriceForToken(token: Transaction['token'], isoTimestamp: string, network: NetworkId): Promise<number | null> {
  return NETWORK_MODULES[network].resolveHistoricalPrice(token, isoTimestamp);
}

export interface PortfolioValuePoint {
  timestamp: string;
  totalValueUsd: number;
}

/**
 * Reconstructs portfolio value over time from every network's priced transaction feed: walks all
 * transactions chronologically (across networks), tracking cumulative balance per (network,
 * contract address) - not per symbol, so two tokens sharing a symbol on different networks/or the
 * same network never get pooled - and each token's last-known price, reporting total value after
 * each event. The final point is anchored to the actual live portfolio value (including
 * Hyperliquid's non-lot-based holdings, e.g. perp equity) so the right edge reflects current
 * prices even when no token's own last transaction was recent.
 */
export async function getPortfolioValueHistory(network?: NetworkId): Promise<PortfolioValuePoint[]> {
  const { byNetwork } = await getAggregatedNetworkData(network);
  const allPriced: PricedTransaction[] = Object.values(byNetwork).flatMap((d) => d!.pricedTransactions);

  const chronological = allPriced
    .filter((tx): tx is PricedTransaction & { priceUsd: number } => tx.amount !== 0 && tx.priceUsd !== null)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const balances = new Map<string, number>();
  const lastPrice = new Map<string, number>();
  const points: PortfolioValuePoint[] = [];

  for (const tx of chronological) {
    const key = `${tx.network}:${tx.token.contractAddress}`;
    balances.set(key, (balances.get(key) ?? 0) + tx.amount);
    lastPrice.set(key, tx.priceUsd);

    let total = 0;
    for (const [k, bal] of balances) {
      if (bal <= 0) continue;
      total += bal * (lastPrice.get(k) ?? 0);
    }
    points.push({ timestamp: tx.timestamp, totalValueUsd: total });
  }

  const { holdings } = await getCurrentHoldings(network);
  const currentTotal = holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
  points.push({ timestamp: new Date().toISOString(), totalValueUsd: currentTotal });

  return points;
}
