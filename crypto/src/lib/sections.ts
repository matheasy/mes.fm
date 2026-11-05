import { isLpContract } from './lp';

/**
 * The portfolio's sections - each holding (and each tax row) belongs to exactly one:
 * AI Trading and MikeFA (everything in those two wallets), Store of Value (Bitcoin in every form, XRP,
 * TGLD), Liquidity (the Main wallet's PancakeSwap position + its CAKE), Cash LP (stablecoins, the Magi
 * BTC/HBD pool, ACE, SURGE) and Tokens (everything else). Pure: used by the pages, the APIs and Taxes.
 */
export type Section = 'ai' | 'mfa' | 'sov' | 'lp' | 'cash' | 'tokens';

export const SECTIONS: Section[] = ['ai', 'mfa', 'sov', 'lp', 'cash', 'tokens'];

export const SECTION_LABELS: Record<Section, string> = {
  ai: 'AI Trading',
  mfa: 'MikeFA Trading',
  sov: 'Store of Value',
  lp: 'Liquidity',
  cash: 'Cash LP',
  tokens: 'Tokens',
};

export const SECTION_LINKS: Record<Section, string> = {
  ai: 'https://mes.fm/ai',
  mfa: 'https://mes.fm/mfa',
  sov: 'https://mes.fm/sov',
  lp: 'https://mes.fm/lp',
  cash: 'https://mes.fm/cash',
  tokens: 'https://mes.fm/tokens',
};

/** Dollar (and euro) stablecoins, every chain's spelling */
export const STABLE_SYMBOLS = new Set([
  'HBD', 'SWAP.HBD', 'USDT', 'USDT0', 'USDC', 'USDC.E', 'USDBC', 'DAI', 'BUSD', 'FDUSD', 'TUSD', 'USDE', 'USDS', 'PYUSD', 'USD1', 'USDD',
  'FRAX', 'LUSD', 'GUSD', 'RLUSD', 'USDB', 'USDP', 'SWAP.USDT', 'SWAP.USDC', 'SWAP.DAI', 'SWAP.BUSD', 'EURC', 'EURT',
]);
/** Hive Engine tokens the owner counts as cash */
export const CASH_EXTRA = new Set(['ACE', 'SURGE']);
/** Store of Value: every 1:1 form of Bitcoin, XRP and TGLD (any wallet) */
export const SOV_SYMBOLS = new Set(['BTC', 'BTCB', 'WBTC', 'CBBTC', 'RENBTC', 'HBTC', 'TBTC', 'SWAP.BTC', 'XRP', 'TGLD']);

export const isCashSymbol = (symbol: string) => {
  const s = symbol.toUpperCase();
  return STABLE_SYMBOLS.has(s) || CASH_EXTRA.has(s);
};

/**
 * Section of a tax row or income item. `source` is the tax source key (main, ai, mfa, bitcoin, xrp,
 * hive:<account>); `asset` its ACB pool (BTC for BTCB ...). Adding to / taking from the PancakeSwap
 * position and CAKE count as Liquidity.
 */
export function taxSectionOf(row: { source: string; asset: string; symbol?: string; kind?: string; counterparty?: string }): Section {
  if (row.source === 'ai') return 'ai';
  if (row.source === 'mfa') return 'mfa';
  const asset = row.asset.toUpperCase();
  if (asset === 'CAKE' || (row.source === 'main' && (row.kind === 'lp' || isLpContract(row.counterparty)))) return 'lp';
  if (SOV_SYMBOLS.has(asset) || SOV_SYMBOLS.has((row.symbol ?? '').toUpperCase())) return 'sov';
  if (isCashSymbol(asset) || isCashSymbol(row.symbol ?? '')) return 'cash';
  return 'tokens';
}
