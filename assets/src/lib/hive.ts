/**
 * SWAP.HIVE and SWAP.HBD are Hive Engine's 1:1-pegged wrapped representations of HIVE/HBD (used
 * for trading against Hive Engine tokens without powering down / leaving L1) - the same idea as
 * BTCB/WBTC being wrapped BTC (see lib/btc.ts). Plain allowlists, not a prefix match, so a
 * same-family-but-different-asset token (e.g. a hypothetical SWAP.LTC) is never folded in.
 */
const HIVE_SYMBOLS = new Set(['HIVE', 'SWAP.HIVE']);
const HBD_SYMBOLS = new Set(['HBD', 'SWAP.HBD']);

/** Which combined bucket a symbol belongs to, or null if it's neither - HIVE and HBD are kept
 * separate (not blended into one total) since HBD is a ~$1 stablecoin and HIVE floats; summing
 * their raw amounts together would be meaningless even though both are "Hive-native". */
export function hiveAssetGroup(symbol: string): 'HIVE' | 'HBD' | null {
  const s = symbol.toUpperCase();
  if (HIVE_SYMBOLS.has(s)) return 'HIVE';
  if (HBD_SYMBOLS.has(s)) return 'HBD';
  return null;
}
