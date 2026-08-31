import type { Disposal, Lot } from './accounting/types';
import { NETWORKS, type NetworkId } from './config';
import { describeNetworkError } from './errors';
import * as bitcoin from './sources/bitcoin';
import * as tgld from './sources/tgld';
import type { PricedTransaction, SourceLedgerData } from './sources/types';
import * as xrp from './sources/xrp';
import type { Holding, NetworkError, Transaction } from './types';

const SOURCE_MODULES: Record<
  NetworkId,
  {
    getNetworkLedgerData: () => Promise<SourceLedgerData>;
    resolveHistoricalPrice: (token: Transaction['token'], isoTimestamp: string) => Promise<number | null>;
  }
> = {
  bitcoin,
  xrp,
  tgld,
};

function sourcesToFetch(network?: NetworkId): NetworkId[] {
  return network ? [network] : NETWORKS;
}

export interface AggregatedSourceData {
  byNetwork: Partial<Record<NetworkId, SourceLedgerData>>;
  networkErrors: Partial<Record<NetworkId, NetworkError>>;
}

/**
 * Fetches every requested source's ledger data independently via Promise.allSettled - one source
 * being slow/rate-limited/down never blocks or blanks out the others. Callers combine `byNetwork`
 * (whatever succeeded) with `networkErrors` (per-source failure reasons) to render partial
 * results instead of an all-or-nothing failure.
 */
export async function getAggregatedNetworkData(network?: NetworkId): Promise<AggregatedSourceData> {
  const targets = sourcesToFetch(network);
  const settled = await Promise.allSettled(targets.map((n) => SOURCE_MODULES[n].getNetworkLedgerData()));

  const byNetwork: Partial<Record<NetworkId, SourceLedgerData>> = {};
  const networkErrors: Partial<Record<NetworkId, NetworkError>> = {};

  settled.forEach((result, i) => {
    const n = targets[i]!;
    if (result.status === 'fulfilled') {
      byNetwork[n] = result.value;
    } else {
      networkErrors[n] = describeNetworkError(result.reason, `Failed to load ${n} data`);
    }
  });

  return { byNetwork, networkErrors };
}

export async function getCurrentHoldings(
  network?: NetworkId,
): Promise<{ holdings: Holding[]; networkErrors: AggregatedSourceData['networkErrors'] }> {
  const { byNetwork, networkErrors } = await getAggregatedNetworkData(network);
  const holdings = Object.values(byNetwork).flatMap((d) => d!.holdings);
  return { holdings, networkErrors };
}

export async function getTransactions(
  network?: NetworkId,
): Promise<{ transactions: Transaction[]; networkErrors: AggregatedSourceData['networkErrors'] }> {
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

/** Per-source lots/disposals, kept separate - each asset's FIFO/LIFO/average queue is its own ledger */
export async function buildLotsAndDisposalsByNetwork(
  network?: NetworkId,
): Promise<{ byNetwork: NetworkLots[]; networkErrors: AggregatedSourceData['networkErrors'] }> {
  const { byNetwork, networkErrors } = await getAggregatedNetworkData(network);
  const result = Object.entries(byNetwork).map(([n, d]) => ({
    network: n as NetworkId,
    lots: d!.lots,
    disposals: d!.disposals,
  }));
  return { byNetwork: result, networkErrors };
}

export async function getHistoricalPriceForToken(
  token: Transaction['token'],
  isoTimestamp: string,
  network: NetworkId,
): Promise<number | null> {
  return SOURCE_MODULES[network].resolveHistoricalPrice(token, isoTimestamp);
}

export interface PortfolioValuePoint {
  timestamp: string;
  totalValueUsd: number;
}

/**
 * Reconstructs portfolio value over time from every source's priced transaction feed: walks all
 * transactions chronologically, tracking cumulative balance per (source, asset key) and each
 * asset's last-known price, reporting total value after each event. The final point is anchored
 * to the actual live portfolio value so the right edge reflects current prices.
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
