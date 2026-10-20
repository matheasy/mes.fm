import type { TaxEntry } from '../tax/acb';
import { readMetas, readSource, type SourceMeta, type StoredTx } from './ledgerStore';
import { STORE_SOURCES } from './storeSources';

export interface StoredLedger {
  tax: TaxEntry[];
  /** The same tax rows per source id */
  taxBySource: Record<string, TaxEntry[]>;
  tx: StoredTx[];
  /** One per source, in STORE_SOURCES order; null = never synced */
  metas: { id: string; label: string; meta: SourceMeta | null }[];
}

/** Reads every stored source (or only `ids`) - a handful of database reads, no outside API */
export async function readStoredLedger(ids?: string[]): Promise<StoredLedger> {
  const defs = ids ? STORE_SOURCES.filter((s) => ids.includes(s.id)) : STORE_SOURCES;
  const metas = await readMetas(defs.map((d) => d.id));
  const datas = await Promise.all(defs.map((d, i) => (metas[i]?.chunks ? readSource(d.id, metas[i]) : Promise.resolve(null))));
  return {
    tax: datas.flatMap((d) => d?.tax ?? []),
    taxBySource: Object.fromEntries(defs.map((d, i) => [d.id, datas[i]?.tax ?? []])),
    tx: datas.flatMap((d) => d?.tx ?? []),
    metas: defs.map((d, i) => ({ id: d.id, label: d.label, meta: metas[i] ?? null })),
  };
}

const when = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'never');

/**
 * Status lines for the Taxes page. `error` without a `check:` key = no stored copy at all (the CSV
 * export refuses then); `check:store:` lines are notes - the stored copy is used, but a person
 * should know (last update failed, or rows were held for review).
 */
export function storeStatusLines(metas: StoredLedger['metas']): { key: string; label: string; entries: number; error: string | null }[] {
  const out: { key: string; label: string; entries: number; error: string | null }[] = [];
  for (const { id, label, meta } of metas) {
    if (!meta?.syncedAt) {
      out.push({ key: id, label, entries: 0, error: meta?.error ? `never stored yet (${meta.error})` : 'not stored yet - press Sync now' });
      continue;
    }
    out.push({ key: id, label, entries: meta.count, error: null });
    if (meta.error)
      out.push({
        key: `check:store:${id}`,
        label,
        entries: 0,
        error: `the last update (${when(meta.checkedAt)}) failed: ${meta.error}. Using the copy stored ${when(meta.syncedAt)}; newer transactions may be missing until the next sync`,
      });
    if (meta.held)
      out.push({
        key: `check:store:held:${id}`,
        label,
        entries: 0,
        error: `${meta.held.missing} stored transaction(s) were not in this source's latest answer (${when(meta.held.at)}). They were kept, nothing was deleted - ask Claude to look before rebuilding this source`,
      });
  }
  return out;
}
