import type { SourceId } from './types';

/** Client-safe constants (config.ts also reads server env vars, so the browser bundle imports from here instead) */

/** Default display threshold: only assets worth at least this many USD are shown/returned. */
export const DEFAULT_MIN_VALUE_USD = 10;

export const SOURCE_LABELS: Record<SourceId, string> = {
  'hive-l1': 'Hive',
  'hive-engine': 'Hive Engine',
  magi: 'Magi',
  ethereum: 'Ethereum',
  arbitrum: 'Arbitrum',
  polygon: 'Polygon',
  base: 'Base',
  optimism: 'Optimism',
  bsc: 'BNB Chain',
  hyperliquid: 'Hyperliquid',
  xrpl: 'XRP Ledger',
};
