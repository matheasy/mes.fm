import type { TaxEntry } from '../tax/acb';
import type { TransactionType } from '../types';
import type { WalletKey } from '../wallets';
import { redisClient } from '../cache';

/**
 * The permanent copy of every transaction the finance pages use (added 2026-10-19 for CRA record
 * keeping: "store the transactions essentially forever"). Each source - one wallet on one network,
 * one Hive account, Hive Engine, TGLD, Bitcoin, XRP - is synced on its own (lib/store/sync.ts) and
 * stored here with NO expiry; the Taxes, Transactions and Liquidity pages read this copy instead of
 * asking the blockchain APIs on every visit.
 *
 * Keys live under `ledgerstore:v1:` - deliberately outside the `portfolio:` / `mfa:` namespaces,
 * which the Refresh buttons bulk-delete. Big sources are split into chunks (Upstash refuses requests
 * over 1 MB): a write puts the chunks under a new generation number, then switches the meta key to it,
 * then deletes the old generation, so a reader never sees half of a write.
 *
 * The merge rule (mergeSource) is what makes it safe to keep forever: a sync may add transactions and
 * correct the ones it already had (same identity, e.g. a better price), but it never silently drops
 * one. If a source comes back *without* something already stored, the stored copy is kept, anything
 * newer than it is appended, and the source is marked `held` for a person to look at - an API that
 * forgot old history, or changed how it identifies transactions, can neither delete records nor
 * double-count them.
 */

const PREFIX = 'ledgerstore:v1';
/** Upstash's request limit is 1 MB; stay well under it */
const CHUNK_CHARS = 600_000;

/** One transaction row for the Transactions page (the tax side uses TaxEntry) */
export interface StoredTx {
  wallet: WalletKey;
  network: string;
  hash: string;
  timestamp: string;
  type: TransactionType;
  token: { symbol: string; contractAddress: string; isNative: boolean };
  from: string;
  to: string;
  amount: number;
  /** Gas paid, in the network's own coin (BNB, ETH, ...) */
  gasNative: number;
  gasUsedUsd: number | null;
  methodLabel: string | null;
  /** A token that never had a market price on this network: in practice a scam airdrop (hidden by default) */
  spam?: boolean;
}

export interface SourceData {
  tax: TaxEntry[];
  tx: StoredTx[];
}

export interface SourceMeta {
  id: string;
  label: string;
  /** Number of tax legs / transaction rows stored */
  count: number;
  txCount: number;
  /** Newest transaction stored (ISO) */
  newest: string | null;
  /** Last time this source was fetched successfully (ISO) - what the page's "last synced" means */
  syncedAt: string | null;
  /** Last attempt, successful or not */
  checkedAt: string | null;
  /** The last attempt's error, if it failed (the stored copy is still there) */
  error: string | null;
  /** Rows the last successful sync added */
  added: number;
  /** The source came back without rows that are stored: kept them, see the file comment */
  held: { missing: number; at: string; sample: string[] } | null;
  gen: number;
  chunks: number;
}

const metaKey = (id: string) => `${PREFIX}:src:${id}:meta`;
const chunkKey = (id: string, gen: number, i: number) => `${PREFIX}:src:${id}:g${gen}:${i}`;
export const SYNC_KEY = `${PREFIX}:sync`;
export const LOCK_KEY = `${PREFIX}:lock`;
export const CHECKS_KEY = `${PREFIX}:checks`;

function client() {
  const r = redisClient();
  if (!r) throw new Error('The database (Upstash Redis) is not configured');
  return r;
}

export async function readMeta(id: string): Promise<SourceMeta | null> {
  return (await client().get<SourceMeta>(metaKey(id))) ?? null;
}

export async function readMetas(ids: string[]): Promise<(SourceMeta | null)[]> {
  if (!ids.length) return [];
  const r = client();
  return (await r.mget<(SourceMeta | null)[]>(...ids.map(metaKey))).map((m) => m ?? null);
}

export async function readSource(id: string, meta?: SourceMeta | null): Promise<SourceData | null> {
  const m = meta === undefined ? await readMeta(id) : meta;
  if (!m || !m.chunks) return null;
  const r = client();
  const parts = await r.mget<({ tax: TaxEntry[]; tx: StoredTx[] } | null)[]>(
    ...Array.from({ length: m.chunks }, (_, i) => chunkKey(id, m.gen, i)),
  );
  if (parts.some((p) => !p)) throw new Error(`stored copy of ${id} is incomplete (generation ${m.gen})`);
  return { tax: parts.flatMap((p) => p!.tax), tx: parts.flatMap((p) => p!.tx) };
}

/** Splits the data into chunks of at most CHUNK_CHARS of JSON each */
function toChunks(data: SourceData): SourceData[] {
  const out: SourceData[] = [];
  let cur: SourceData = { tax: [], tx: [] };
  let size = 0;
  const push = (kind: 'tax' | 'tx', item: TaxEntry | StoredTx) => {
    const n = JSON.stringify(item).length + 1;
    if (size + n > CHUNK_CHARS && (cur.tax.length || cur.tx.length)) {
      out.push(cur);
      cur = { tax: [], tx: [] };
      size = 0;
    }
    (cur[kind] as (TaxEntry | StoredTx)[]).push(item);
    size += n;
  };
  for (const t of data.tax) push('tax', t);
  for (const t of data.tx) push('tx', t);
  out.push(cur);
  return out;
}

export async function writeSource(id: string, data: SourceData, meta: Omit<SourceMeta, 'gen' | 'chunks'>, prev: SourceMeta | null): Promise<SourceMeta> {
  const r = client();
  const gen = (prev?.gen ?? 0) + 1;
  const chunks = toChunks(data);
  for (let i = 0; i < chunks.length; i++) await r.set(chunkKey(id, gen, i), chunks[i]);
  const full: SourceMeta = { ...meta, gen, chunks: chunks.length };
  await r.set(metaKey(id), full);
  if (prev?.chunks) await r.del(...Array.from({ length: prev.chunks }, (_, i) => chunkKey(id, prev.gen, i)));
  return full;
}

/** Records a failed attempt without touching the stored rows */
export async function writeMetaOnly(id: string, meta: SourceMeta): Promise<void> {
  await client().set(metaKey(id), meta);
}

// ---- identities and the merge rule ----

/** A tax leg's identity: everything that can't change about it (not its price or amount, which can be
 * corrected), numbered when one transaction has several identical-looking legs */
function taxKeys(list: TaxEntry[]): string[] {
  const seen = new Map<string, number>();
  return list.map((e) => {
    const k = `${e.source}|${e.network}|${e.hash}|${e.symbol}|${e.from}|${e.to}|${e.timestamp}|${Math.sign(e.amount)}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${k}#${n}`;
  });
}

function txKeys(list: StoredTx[]): string[] {
  const seen = new Map<string, number>();
  return list.map((t) => {
    const k = `${t.wallet}|${t.network}|${t.hash}|${t.token.contractAddress}|${t.from}|${t.to}|${t.timestamp}|${Math.sign(t.amount)}`;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return `${k}#${n}`;
  });
}

const newestOf = (d: SourceData): string | null => {
  let max: string | null = null;
  for (const e of d.tax) if (!max || e.timestamp > max) max = e.timestamp;
  for (const t of d.tx) if (!max || t.timestamp > max) max = t.timestamp;
  return max;
};

export interface MergeResult {
  data: SourceData;
  added: number;
  /** Stored rows the fresh copy no longer has (kept anyway) */
  missing: string[];
}

/**
 * Combines the stored copy with a fresh one. If the fresh copy still has every stored row, it wins
 * (it may carry corrections). Otherwise the stored copy is kept as it is and only rows newer than its
 * newest one are appended - so neither a shrinking API nor a change of identifiers can lose or
 * duplicate records. `rebuild` = take the fresh copy as it is (a person asked for it).
 */
export function mergeSource(stored: SourceData | null, fresh: SourceData, rebuild = false): MergeResult {
  if (!stored || rebuild) {
    const before = stored ? new Set([...taxKeys(stored.tax), ...txKeys(stored.tx)]) : new Set<string>();
    const freshKeys = [...taxKeys(fresh.tax), ...txKeys(fresh.tx)];
    return { data: fresh, added: freshKeys.filter((k) => !before.has(k)).length, missing: [] };
  }
  const freshTax = new Set(taxKeys(fresh.tax));
  const freshTx = new Set(txKeys(fresh.tx));
  const storedTaxKeys = taxKeys(stored.tax);
  const storedTxKeys = txKeys(stored.tx);
  const missing = [...storedTaxKeys.filter((k) => !freshTax.has(k)), ...storedTxKeys.filter((k) => !freshTx.has(k))];
  const storedSet = new Set([...storedTaxKeys, ...storedTxKeys]);
  const fk = taxKeys(fresh.tax);
  const fx = txKeys(fresh.tx);
  if (!missing.length) {
    const added = fk.filter((k) => !storedSet.has(k)).length + fx.filter((k) => !storedSet.has(k)).length;
    return { data: fresh, added, missing: [] };
  }
  const cutoff = newestOf(stored) ?? '';
  const newTax = fresh.tax.filter((e, i) => !storedSet.has(fk[i]!) && e.timestamp > cutoff);
  const newTx = fresh.tx.filter((t, i) => !storedSet.has(fx[i]!) && t.timestamp > cutoff);
  return { data: { tax: [...stored.tax, ...newTax], tx: [...stored.tx, ...newTx] }, added: newTax.length + newTx.length, missing };
}

export function summarizeData(d: SourceData): Pick<SourceMeta, 'count' | 'txCount' | 'newest'> {
  return { count: d.tax.length, txCount: d.tx.length, newest: newestOf(d) };
}

// ---- frozen documents (the "as filed" tax reports) ----

/** Stores a JSON document permanently, split like the sources (never overwritten: ids are unique) */
export async function putDocument(id: string, doc: unknown): Promise<number> {
  const r = client();
  const text = JSON.stringify(doc);
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) parts.push(text.slice(i, i + CHUNK_CHARS));
  for (let i = 0; i < parts.length; i++) await r.set(`${PREFIX}:doc:${id}:${i}`, JSON.stringify({ t: parts[i] }));
  await r.set(`${PREFIX}:doc:${id}:n`, parts.length);
  return text.length;
}

export async function getDocument<T>(id: string): Promise<T | null> {
  const r = client();
  const n = await r.get<number>(`${PREFIX}:doc:${id}:n`);
  if (!n) return null;
  const parts = await r.mget<({ t: string } | null)[]>(...Array.from({ length: n }, (_, i) => `${PREFIX}:doc:${id}:${i}`));
  if (parts.some((p) => !p)) throw new Error(`document ${id} is incomplete`);
  return JSON.parse(parts.map((p) => p!.t).join('')) as T;
}

export const FILED_INDEX_KEY = `${PREFIX}:filed:index`;

export interface FiledEntry {
  id: string;
  year: number;
  savedAt: string;
  gainCad: number;
  incomeCad: number;
  rows: number;
  note: string;
}
