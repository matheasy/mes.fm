import type { NetworkId } from './config';

export type { NetworkId };

export interface Token {
  /** Native-coin sentinel for the native asset, otherwise the (lowercased) contract address or
   *  synthetic asset key ('BTC' for the combined BTCB+WBTC position, 'XRP', 'TGLD') */
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  /** CoinGecko coin id, or null when priced another way (e.g. TGLD via Hive Engine market) */
  coingeckoId: string | null;
  network: NetworkId;
}

export interface Holding {
  token: Token;
  balance: string;
  balanceFormatted: number;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
  /** Unused in SOV (kept for shared component compatibility with the ai/ tracker) */
  category?: 'spot' | 'perp-equity';
}

export interface PortfolioSummary {
  wallet: string;
  totalValueUsd: number;
  change24hUsd: number;
  change24hPct: number;
  holdings: Holding[];
  fetchedAt: string;
}

export type TransactionType = 'send' | 'receive' | 'swap' | 'contract';

export interface Transaction {
  hash: string;
  network: NetworkId;
  timestamp: string;
  type: TransactionType;
  token: Pick<Token, 'symbol' | 'contractAddress' | 'isNative'>;
  from: string;
  to: string;
  /** Signed: positive = received, negative = sent, in token units */
  amount: number;
  /** Gas/fee paid in the source's native unit (only XRP ledger fees are tracked; 0 elsewhere) */
  gasUsedNative: number;
  gasUsedUsd: number | null;
  methodLabel: string | null;
  /** For combined-BTC rows: the underlying token + chain this leg actually came from, e.g. "WBTC · Polygon" */
  subLabel?: string;
  /** Chain-correct explorer link, set when `network` alone can't determine it (combined BTC across chains) */
  explorerUrl?: string;
}

export interface TransactionFilters {
  token?: string;
  type?: TransactionType;
  network?: NetworkId;
  startDate?: string;
  endDate?: string;
}

/** Per-source fetch failure, surfaced alongside partial `data` so one source's outage doesn't blank the dashboard */
export interface NetworkError {
  message: string;
  rateLimited: boolean;
}

export type ApiResult<T> =
  | { data: T; networkErrors?: Partial<Record<NetworkId, NetworkError>>; error?: never; rateLimited?: never }
  | { data?: never; networkErrors?: never; error: string; rateLimited?: boolean };
