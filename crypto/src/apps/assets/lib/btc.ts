/**
 * Wrapped-Bitcoin normalization: BTCB (BSC), WBTC (Ethereum/Polygon/Arbitrum/...), cbBTC
 * (Coinbase), renBTC, HBTC, tBTC, and Hive Engine's SWAP.BTC are all 1:1-pegged representations
 * of the same underlying asset - shown as their real symbol in the holdings table (so it's clear
 * which bridge/chain each sits on), but summed into one combined figure alongside native BTC.
 * A plain allowlist rather than a `/btc$/i` pattern, so an unrelated token that merely ends in
 * "BTC" never gets folded in by accident.
 */
const WRAPPED_BTC_SYMBOLS = new Set(['BTC', 'BTCB', 'WBTC', 'CBBTC', 'RENBTC', 'HBTC', 'TBTC', 'SWAP.BTC']);

export function isBitcoinSymbol(symbol: string): boolean {
  return WRAPPED_BTC_SYMBOLS.has(symbol.toUpperCase());
}
