/**
 * MES Assets - one normalized shape for everything the owner holds, regardless of where it lives
 * (Hive L1, Hive Engine, Magi, an EVM chain, Hyperliquid, XRPL). Every source module returns
 * `Holding[]`; snapshot.ts stitches them together.
 */

/** A logical owner: one Hive identity, or one EVM address, or one XRPL address */
export type GroupKey = 'hive' | 'main' | 'ai' | 'mfa' | 'xrp';

/** Where a holding physically lives - one data source / chain */
export type SourceId =
  | 'hive-l1'
  | 'hive-engine'
  | 'magi'
  | 'ethereum'
  | 'arbitrum'
  | 'polygon'
  | 'base'
  | 'optimism'
  | 'bsc'
  | 'hyperliquid'
  | 'xrpl';

export type AssetKind =
  | 'token' // liquid token / coin balance
  | 'staked' // staked / locked / powered-up (HP, HE stake, HYPE staking, Magi consensus stake)
  | 'savings' // HBD/HIVE savings
  | 'reward' // unclaimed rewards
  | 'lp' // liquidity-pool position (priced from pool reserves)
  | 'vault' // Hyperliquid vault deposit
  | 'perp'; // Hyperliquid perps account equity

export interface LpLeg {
  symbol: string;
  amount: number;
  valueUsd: number | null;
}

export interface LpInfo {
  /** e.g. "BTC/HBD" or "Uniswap V3 ETH/USDC" */
  pool: string;
  /** Fraction of the pool this position owns (0-1), when known */
  share: number | null;
  legs: LpLeg[];
}

export interface Holding {
  /** Unique within a snapshot */
  id: string;
  group: GroupKey;
  source: SourceId;
  kind: AssetKind;
  symbol: string;
  /** Display override, e.g. "Hive Power" for symbol HIVE / kind staked */
  label?: string;
  /** Token contract (EVM) when there is one */
  contract?: string;
  amount: number;
  priceUsd: number | null;
  valueUsd: number | null;
  change24hPct: number | null;
  /** Short human note: "liquid 1,000 + staked 500", "delegated out: 6,353", ... */
  detail?: string;
  /** True when the only price is a stale/thin last-trade (Hive Engine): value may not be realizable */
  thin?: boolean;
  lp?: LpInfo;
}

/** What a source module returns: a Holding minus the fields snapshot.ts assigns (group, source, id) */
export type RawHolding = Omit<Holding, 'id' | 'group' | 'source'>;

export interface SourceResult {
  holdings: RawHolding[];
  /** Non-fatal notice shown in the source status list */
  note?: string;
}

export interface SourceStatus {
  group: GroupKey;
  source: SourceId;
  ok: boolean;
  /** Cheap notice that isn't a failure, e.g. "NODEREAL_API_KEY not set - BNB Chain tokens not scanned" */
  note?: string;
  error?: string;
  rateLimited?: boolean;
  count: number;
  fetchedAt: string;
}

export interface GroupSummary {
  key: GroupKey;
  label: string;
  link?: string;
  address?: string;
  /** Total of the holdings returned (i.e. after the minValueUsd filter) */
  totalUsd: number;
  /** Total including everything below the threshold */
  totalAllUsd: number;
  holdingCount: number;
  hiddenCount: number;
  hiddenUsd: number;
}

export interface AssetsSnapshot {
  fetchedAt: string;
  minValueUsd: number;
  totalUsd: number;
  totalAllUsd: number;
  hiddenCount: number;
  hiddenUsd: number;
  groups: GroupSummary[];
  holdings: Holding[];
  sources: SourceStatus[];
}

export type ApiResult<T> =
  | { data: T; error?: never; rateLimited?: never }
  | { data?: never; error: string; rateLimited?: boolean };
