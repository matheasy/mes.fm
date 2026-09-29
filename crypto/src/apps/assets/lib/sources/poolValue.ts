import type { LpLeg } from '../types';

/**
 * Value of a constant-product (x*y=k) pool position. Both sides of such a pool carry equal value,
 * so when one leg is a *trusted* price (HIVE/HBD/BTC from CoinGecko) the position is worth twice
 * that leg - which is robust to the other leg being a thin, stale-priced token (a Hive Engine token
 * whose last trade was long ago would otherwise under- or over-state the pool). With no trusted leg
 * it sums whatever is priced (doubling if only one side is).
 */
export function constantProductValueUsd(legs: LpLeg[], isTrusted: (symbol: string) => boolean): number | null {
  const priced = legs.filter((l) => l.valueUsd !== null);
  if (priced.length === 0) return null;

  const trusted = priced.filter((l) => isTrusted(l.symbol));
  if (trusted.length === 1) return trusted[0]!.valueUsd! * 2;
  if (priced.length === 2) return priced[0]!.valueUsd! + priced[1]!.valueUsd!;
  return priced[0]!.valueUsd! * 2;
}
