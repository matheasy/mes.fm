import type { GroupKey, SourceId } from './types';

/**
 * MES Assets: every account/wallet the owner wants tracked in one place. Data is fetched ONCE here
 * (cached in Redis) and re-served to the dashboards (mes.fm/ai, /mfa, /sov, /portfolio) so each
 * upstream API is only hit by this one app.
 */

/** Hive account name - one identity spanning Hive L1, Hive Engine (layer 2) and Magi (altera.magi.eco) */
export const HIVE_ACCOUNT = 'mes';

/** EVM wallets (lowercased). The same address exists on every EVM chain + Hyperliquid. */
export const EVM_ADDRESSES = {
  /** Main / store-of-value wallet (the sov tracker's BTCB/WBTC address) */
  main: '0xe6c0634d02ae5f136500ac9428ed5d9576695ef9',
  /** mes.fm/ai's wallet */
  ai: '0x89ac35e57216a51cf08f1c14b3ce19d6813ee492',
  /** mes.fm/mfa's wallet */
  mfa: '0xaef8a5ab45652bc612b2ce72b0631c9e052404a5',
} as const;

export const XRP_ADDRESS = 'rDqSZAsxSEBoTgPGDbSqKEtrEe4JxKkDNh';

export const EVM_SOURCES: SourceId[] = ['ethereum', 'arbitrum', 'polygon', 'base', 'optimism', 'bsc', 'hyperliquid'];

export interface GroupConfig {
  key: GroupKey;
  label: string;
  link?: string;
  address?: string;
  sources: SourceId[];
}

export const GROUPS: GroupConfig[] = [
  { key: 'hive', label: 'Hive @mes', link: 'https://peakd.com/@mes/wallet', address: HIVE_ACCOUNT, sources: ['hive-l1', 'hive-engine', 'magi'] },
  { key: 'main', label: 'Main wallet', address: EVM_ADDRESSES.main, sources: EVM_SOURCES },
  { key: 'ai', label: 'AI Trading wallet', link: 'https://mes.fm/ai', address: EVM_ADDRESSES.ai, sources: EVM_SOURCES },
  { key: 'mfa', label: 'MikeFA wallet', link: 'https://mes.fm/mfa', address: EVM_ADDRESSES.mfa, sources: EVM_SOURCES },
  { key: 'xrp', label: 'XRP Ledger', address: XRP_ADDRESS, sources: ['xrpl'] },
];

export const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g])) as Record<GroupKey, GroupConfig>;

export { SOURCE_LABELS, DEFAULT_MIN_VALUE_USD } from './constants';

/** Rows worth less than this are dropped at fetch time (cache hygiene, e.g. 140 Hive Engine dust tokens) */
export const FETCH_FLOOR_USD = 0.01;

export const TTL = {
  /** How long one source's holdings are served from cache before re-fetching */
  holdings: 10 * 60,
  spotPrice: 3 * 60,
  tokenPrice: 10 * 60,
  /** BNB Chain token discovery scans the wallet's whole transfer history (NodeReal credits) - rarely changes */
  bscDiscovery: 12 * 60 * 60,
} as const;

/** Blockscout-indexed EVM chains (keyless; return token balances WITH USD prices in one call) */
export interface BlockscoutChain {
  id: 'ethereum' | 'arbitrum' | 'polygon' | 'base' | 'optimism';
  host: string;
  nativeSymbol: string;
  chainId: number;
  /** CoinGecko asset-platform id, for pricing LP underlying tokens that Blockscout can't price */
  coingeckoPlatform: string;
  explorerAddress: (addr: string) => string;
}

export const BLOCKSCOUT_CHAINS: Record<BlockscoutChain['id'], BlockscoutChain> = {
  ethereum: { id: 'ethereum', host: 'eth.blockscout.com', nativeSymbol: 'ETH', chainId: 1, coingeckoPlatform: 'ethereum', explorerAddress: (a) => `https://etherscan.io/address/${a}` },
  arbitrum: { id: 'arbitrum', host: 'arbitrum.blockscout.com', nativeSymbol: 'ETH', chainId: 42161, coingeckoPlatform: 'arbitrum-one', explorerAddress: (a) => `https://arbiscan.io/address/${a}` },
  polygon: { id: 'polygon', host: 'polygon.blockscout.com', nativeSymbol: 'POL', chainId: 137, coingeckoPlatform: 'polygon-pos', explorerAddress: (a) => `https://polygonscan.com/address/${a}` },
  base: { id: 'base', host: 'base.blockscout.com', nativeSymbol: 'ETH', chainId: 8453, coingeckoPlatform: 'base', explorerAddress: (a) => `https://basescan.org/address/${a}` },
  optimism: { id: 'optimism', host: 'explorer.optimism.io', nativeSymbol: 'ETH', chainId: 10, coingeckoPlatform: 'optimistic-ethereum', explorerAddress: (a) => `https://optimistic.etherscan.io/address/${a}` },
};

/** Keyless public JSON-RPC endpoints (tried in order) - used for LP-position reads and BNB Chain balances */
export const RPC_URLS: Record<'ethereum' | 'arbitrum' | 'polygon' | 'base' | 'optimism' | 'bsc' | 'hyperliquid', string[]> = {
  ethereum: [process.env.ETHEREUM_RPC_URL, 'https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com'].filter(Boolean) as string[],
  arbitrum: [process.env.ARBITRUM_RPC_URL, 'https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc'].filter(Boolean) as string[],
  polygon: [process.env.POLYGON_RPC_URL, 'https://polygon-bor-rpc.publicnode.com', 'https://polygon-rpc.com'].filter(Boolean) as string[],
  base: [process.env.BASE_RPC_URL, 'https://base-rpc.publicnode.com', 'https://mainnet.base.org'].filter(Boolean) as string[],
  optimism: [process.env.OPTIMISM_RPC_URL, 'https://optimism-rpc.publicnode.com', 'https://mainnet.optimism.io'].filter(Boolean) as string[],
  bsc: [process.env.BSC_RPC_URL, 'https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org', 'https://bsc-dataseed1.defibit.io'].filter(Boolean) as string[],
  hyperliquid: [process.env.HYPEREVM_RPC_URL, 'https://rpc.hyperliquid.xyz/evm'].filter(Boolean) as string[],
};

/** Uniswap-V3-style concentrated-liquidity position managers (ERC-721) per chain */
export const V3_MANAGERS: Record<string, { name: string; address: string }[]> = {
  ethereum: [
    { name: 'Uniswap V3', address: '0xc36442b4a4522e871399cd717abdd847ab11fe88' },
    { name: 'PancakeSwap V3', address: '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364' },
  ],
  arbitrum: [
    { name: 'Uniswap V3', address: '0xc36442b4a4522e871399cd717abdd847ab11fe88' },
    { name: 'PancakeSwap V3', address: '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364' },
  ],
  polygon: [{ name: 'Uniswap V3', address: '0xc36442b4a4522e871399cd717abdd847ab11fe88' }],
  optimism: [{ name: 'Uniswap V3', address: '0xc36442b4a4522e871399cd717abdd847ab11fe88' }],
  base: [
    { name: 'Uniswap V3', address: '0x03a520b32c04bf3beef7beb72e919cf822ed34f1' },
    { name: 'PancakeSwap V3', address: '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364' },
  ],
  bsc: [
    { name: 'PancakeSwap V3', address: '0x46a15b0b27311cedf172ab29e4f4766fbe7f4364' },
    { name: 'Uniswap V3', address: '0x7b8a01b39d58278b5de7e48c8449c9f4f5170613' },
  ],
};

/** Hive L1 JSON-RPC nodes (tried in order) */
export const HIVE_RPC_NODES = ['https://api.hive.blog', 'https://api.openhive.network', 'https://api.c0ff33a.uk'];

export const HIVE_ENGINE_RPC = process.env.HIVE_ENGINE_RPC_URL ?? 'https://api.hive-engine.com/rpc';

/** Magi (formerly VSC) GraphQL API + Hasura indexer */
export const MAGI_API = process.env.MAGI_API_URL ?? 'https://api.okinoko.io/api/v1/graphql';
export const MAGI_INDEXER = process.env.MAGI_INDEXER_URL ?? 'https://api.okinoko.io/hasura/v1/graphql';
/** Magi BTC mapping contract - holds each account's bridged BTC (in sats) under key `a-<did>` */
export const MAGI_BTC_CONTRACT = 'vsc1BdrQ6EtbQ64rq2PkPd21x4MaLnVRcJj85d';

export const XRPL_RPC = process.env.XRPL_RPC_URL ?? 'https://xrplcluster.com/';
export const HYPERLIQUID_INFO = 'https://api.hyperliquid.xyz/info';
