import { NATIVE_TOKENS, NETWORKS, NETWORK_LABELS, type NetworkId } from '@/apps/ai/lib/config';
import { getAggregatedNetworkData, getHistoricalPriceForToken } from '@/apps/ai/lib/ledger';
import { runAsWallet } from '@/apps/ai/lib/walletContext';
import { getHistoricalPriceForToken as mfaPrice, getPricedTransactions as mfaPriced } from '@/apps/mfa/lib/ledger';
import type { TaxEntry } from '../tax/acb';
import { HIVE_ACCOUNTS } from '../tax/accounts';
import { getBitcoinEntries } from '../tax/sources/bitcoin';
import { getHiveEntries } from '../tax/sources/hive';
import { getHiveEngineEntries } from '../tax/sources/hiveEngine';
import { getTgldEntries } from '../tax/sources/tgld';
import { getXrpEntries } from '../tax/sources/xrp';
import { WALLET_LABELS, type WalletKey } from '../wallets';
import type { SourceData, StoredTx } from './ledgerStore';

/**
 * Every source the permanent store keeps, and how each is fetched. A *fetcher* can fill several
 * sources at once (one call loads a wallet's five networks, one call the four Hive accounts); each
 * source is still stored and judged on its own, so a network that fails keeps its last good copy.
 * The fetchers are the same code paths the pages used to call live, so the stored rows are exactly
 * what the Taxes report was computed from before.
 */

export interface StoreSourceDef {
  id: string;
  label: string;
  /** Which fetcher fills it */
  fetcher: string;
}

const EVM_WALLETS: { wallet: Exclude<WalletKey, 'mfa' | 'sov'>; networks: NetworkId[] }[] = [
  { wallet: 'main', networks: NETWORKS },
  { wallet: 'ai', networks: NETWORKS },
];

export const STORE_SOURCES: StoreSourceDef[] = [
  ...EVM_WALLETS.flatMap(({ wallet, networks }) =>
    networks.map((n) => ({ id: `evm:${wallet}:${n}`, label: `${WALLET_LABELS[wallet]} · ${NETWORK_LABELS[n]}`, fetcher: `evm:${wallet}` })),
  ),
  { id: 'evm:mfa:bsc', label: `${WALLET_LABELS.mfa} · BSC`, fetcher: 'evm:mfa' },
  ...HIVE_ACCOUNTS.map((a) => ({ id: `hive:${a}`, label: `Hive @${a}`, fetcher: 'hive' })),
  { id: 'hive-engine', label: 'Hive Engine (SWAP.HIVE, LEO, SWAP.BTC...)', fetcher: 'hive-engine' },
  { id: 'tgld', label: 'TGLD (Hive Engine)', fetcher: 'tgld' },
  { id: 'bitcoin', label: 'Bitcoin', fetcher: 'bitcoin' },
  { id: 'xrp', label: 'XRP', fetcher: 'xrp' },
];

export const FETCHERS = [...new Set(STORE_SOURCES.map((s) => s.fetcher))];

/** What a fetcher returns: per source id, its rows or why it failed */
export type FetchResult = Record<string, { data: SourceData } | { error: string }>;

const taxOnly = (tax: TaxEntry[]): SourceData => ({ tax, tx: [] });

/** USD of each gas payment, looked up once per network and day */
async function gasUsd(rows: { timestamp: string; gasNative: number }[], priceOf: (iso: string) => Promise<number | null>): Promise<(number | null)[]> {
  const byDay = new Map<string, Promise<number | null>>();
  return Promise.all(
    rows.map(async (r) => {
      if (!r.gasNative) return null;
      const day = r.timestamp.slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, priceOf(r.timestamp).catch(() => null));
      const p = await byDay.get(day)!;
      return p === null ? null : r.gasNative * p;
    }),
  );
}

async function fetchEvm(wallet: 'main' | 'ai', networks: NetworkId[]): Promise<FetchResult> {
  const { byNetwork, networkErrors } = await runAsWallet(wallet, () => getAggregatedNetworkData(undefined, { includeExcluded: true }));
  const out: FetchResult = {};
  for (const n of networks) {
    const id = `evm:${wallet}:${n}`;
    const d = byNetwork[n];
    if (!d) {
      out[id] = { error: networkErrors[n]?.message ?? `${n} did not load` };
      continue;
    }
    const tax: TaxEntry[] = d.pricedTransactions
      .filter((t) => t.amount !== 0)
      .map((t) => ({ source: wallet, hash: t.hash, network: n, timestamp: t.timestamp, symbol: t.token.symbol, amount: t.amount, priceUsd: t.priceUsd, from: t.from, to: t.to }));
    const priced = new Set(d.pricedTransactions.filter((t) => t.priceUsd !== null).map((t) => t.token.contractAddress.toLowerCase()));
    const native = NATIVE_TOKENS[n];
    const gas = await runAsWallet(wallet, () =>
      gasUsd(
        d.transactions.map((t) => ({ timestamp: t.timestamp, gasNative: t.gasUsedNative })),
        (iso) => getHistoricalPriceForToken({ symbol: native.symbol, contractAddress: native.contractAddress, isNative: true }, iso, n),
      ),
    );
    const tx: StoredTx[] = d.transactions.map((t, i) => ({
      wallet,
      network: n,
      hash: t.hash,
      timestamp: t.timestamp,
      type: t.type,
      token: { symbol: t.token.symbol, contractAddress: t.token.contractAddress, isNative: t.token.isNative },
      from: t.from,
      to: t.to,
      amount: t.amount,
      gasNative: t.gasUsedNative,
      gasUsedUsd: gas[i] ?? null,
      methodLabel: t.methodLabel,
      ...(!t.token.isNative && !priced.has(t.token.contractAddress.toLowerCase()) ? { spam: true } : {}),
    }));
    out[id] = { data: { tax, tx } };
  }
  return out;
}

async function fetchMfa(): Promise<FetchResult> {
  const priced = await mfaPriced();
  const tax: TaxEntry[] = priced
    .filter((t) => t.amount !== 0)
    .map((t) => ({ source: 'mfa', hash: t.hash, network: 'bsc', timestamp: t.timestamp, symbol: t.token.symbol, amount: t.amount, priceUsd: t.priceUsd, from: t.from, to: t.to }));
  const pricedTokens = new Set(priced.filter((t) => t.priceUsd !== null).map((t) => t.token.contractAddress.toLowerCase()));
  const gas = await gasUsd(
    priced.map((t) => ({ timestamp: t.timestamp, gasNative: t.gasUsedBnb })),
    (iso) => mfaPrice({ symbol: 'BNB', contractAddress: 'BNB', isNative: true }, iso),
  );
  const tx: StoredTx[] = priced.map((t, i) => ({
    wallet: 'mfa',
    network: 'bsc',
    hash: t.hash,
    timestamp: t.timestamp,
    type: t.type,
    token: { symbol: t.token.symbol, contractAddress: t.token.contractAddress, isNative: t.token.isNative },
    from: t.from,
    to: t.to,
    amount: t.amount,
    gasNative: t.gasUsedBnb,
    gasUsedUsd: gas[i] ?? null,
    methodLabel: t.methodLabel,
    ...(!t.token.isNative && t.amount !== 0 && !pricedTokens.has(t.token.contractAddress.toLowerCase()) ? { spam: true } : {}),
  }));
  return { 'evm:mfa:bsc': { data: { tax, tx } } };
}

async function fetchHive(): Promise<FetchResult> {
  const r = await getHiveEntries();
  const out: FetchResult = {};
  const failed = new Map(r.errors.map((e) => [e.account, e.error]));
  for (const a of HIVE_ACCOUNTS) {
    const err = failed.get(a) ?? failed.get('all accounts');
    out[`hive:${a}`] = err ? { error: err } : { data: taxOnly(r.entries.filter((e) => e.source === `hive:${a}`)) };
  }
  return out;
}

const single = (id: string, load: () => Promise<TaxEntry[]>) => async (): Promise<FetchResult> => ({ [id]: { data: taxOnly(await load()) } });

export const FETCHER_FNS: Record<string, () => Promise<FetchResult>> = {
  'evm:main': () => fetchEvm('main', NETWORKS),
  'evm:ai': () => fetchEvm('ai', NETWORKS),
  'evm:mfa': fetchMfa,
  hive: fetchHive,
  'hive-engine': single('hive-engine', getHiveEngineEntries),
  tgld: single('tgld', getTgldEntries),
  bitcoin: single('bitcoin', getBitcoinEntries),
  xrp: single('xrp', getXrpEntries),
};
