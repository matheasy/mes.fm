import type { NetworkId } from './config';

export type { NetworkId };

export interface Token {
  /** Native-coin sentinel (e.g. 'BNB', 'ETH') for the native asset, otherwise the checksummed contract address */
  contractAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  /** CoinGecko coin id, resolved lazily and cached; null if unresolved */
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
  /** 'perp-equity' marks the single Hyperliquid perpetuals account-equity row - kept out of spot
   *  cost-basis accounting but still counted in the aggregate portfolio total, per the requirement
   *  to keep perps clearly labeled separately from spot holdings. */
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
  /** Gas paid in the network's native coin (BNB/ETH/HYPE - see NATIVE_TOKENS) */
  gasUsedNative: number;
  gasUsedUsd: number | null;
  methodLabel: string | null;
}

export interface TransactionFilters {
  token?: string;
  type?: TransactionType;
  network?: NetworkId;
  startDate?: string;
  endDate?: string;
}

/** Per-network fetch failure, surfaced alongside partial `data` so one network's outage doesn't blank the whole dashboard */
export interface NetworkError {
  message: string;
  rateLimited: boolean;
}

export type ApiResult<T> =
  | { data: T; networkErrors?: Partial<Record<NetworkId, NetworkError>>; error?: never; rateLimited?: never }
  | { data?: never; networkErrors?: never; error: string; rateLimited?: boolean };
