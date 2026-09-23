import { BTC_ADDRESS, ESPLORA_APIS, FETCH_FLOOR_USD } from '../config';
import { fetchJson } from '../http';
import { getSpot } from '../prices';
import type { SourceResult } from '../types';

/** Esplora `/address/:addr` shape (blockstream.info / mempool.space share this API) */
interface EsploraAddress {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
}

async function esplora(address: string): Promise<EsploraAddress> {
  let lastErr: unknown;
  for (const base of ESPLORA_APIS) {
    try {
      return await fetchJson<EsploraAddress>(`${base}/address/${address}`, { retries: 1, timeoutMs: 15_000, throttle: { key: 'esplora', minIntervalMs: 300 } });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all Esplora APIs failed');
}

/** Bitcoin L1: the confirmed native balance of one address (keyless Esplora-compatible public API). */
export async function fetchBitcoin(address = BTC_ADDRESS): Promise<SourceResult> {
  const [stats, spot] = await Promise.all([esplora(address), getSpot()]);

  const sats = stats.chain_stats.funded_txo_sum - stats.chain_stats.spent_txo_sum;
  const amount = sats / 1e8;
  const priceUsd = spot.bitcoin.usd;
  const valueUsd = amount * priceUsd;
  if (valueUsd < FETCH_FLOOR_USD) return { holdings: [] };

  return {
    holdings: [
      {
        symbol: 'BTC',
        kind: 'token',
        label: 'BTC (native)',
        amount,
        priceUsd,
        valueUsd,
        change24hPct: spot.bitcoin.change24h,
        detail: 'confirmed on-chain balance',
      },
    ],
  };
}
