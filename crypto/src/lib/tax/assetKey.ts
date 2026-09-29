/**
 * Which ACB pool a token belongs to. The CRA's identical-property rule pools every unit of the same
 * property you own, whatever wallet or chain it sits on, so the pool key is the *asset*, not the
 * token contract:
 *  - Bitcoin in all its wrapped forms (BTCB, WBTC, cbBTC, SWAP.BTC, ...) is one BTC pool - the
 *    owner's instruction ("BTCB and SWAP.BTC are just wrapped Bitcoin"), and how mes.fm/sov
 *    already accounts for them.
 *  - Ether is one ETH pool (native ETH on Ethereum/Arbitrum, WETH, BNB Chain's Binance-Peg ETH,
 *    Hyperliquid's UETH); Hyperliquid's UBTC is BTC.
 *  - BNB and WBNB are one BNB pool.
 *  - Everything else pools by upper-case symbol. Unpriced lookalikes (scam airdrops reusing a real
 *    symbol) never reach a pool - the calculation skips any leg without a price.
 */
const ALIASES: Record<string, string> = {
  BTC: 'BTC',
  BTCB: 'BTC',
  WBTC: 'BTC',
  CBBTC: 'BTC',
  RENBTC: 'BTC',
  HBTC: 'BTC',
  TBTC: 'BTC',
  'SWAP.BTC': 'BTC',
  UBTC: 'BTC', // Hyperliquid spot's bridged BTC
  ETH: 'ETH',
  UETH: 'ETH', // Hyperliquid spot's bridged ETH
  WETH: 'ETH',
  BNB: 'BNB',
  WBNB: 'BNB',
  HIVE: 'HIVE',
  'SWAP.HIVE': 'HIVE',
  HBD: 'HBD',
  'SWAP.HBD': 'HBD',
};

export function assetKey(symbol: string): string {
  const s = symbol.trim().toUpperCase();
  return ALIASES[s] ?? s;
}
