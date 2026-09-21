import { getSpot, getTokenQuotes, type Quote } from '../prices';
import type { PriceOf } from './lp';
import { wellKnownUsd } from './wellKnown';

/**
 * Price resolver for LP legs, cheapest source first: prices the indexer already gave us, then
 * well-known wrapped/stable tokens off the shared spot call, and only then a per-contract CoinGecko lookup.
 */
export function makePriceOf(chain: string, coingeckoPlatform: string, known: Map<string, Quote>): PriceOf {
  return async (contract) => {
    const c = contract.toLowerCase();
    const hit = known.get(c);
    if (hit) return hit;
    const wk = wellKnownUsd(chain, c, await getSpot());
    if (wk) return wk;
    return (await getTokenQuotes(coingeckoPlatform, [c]))[c] ?? null;
  };
}
