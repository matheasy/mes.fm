import { cacheKey, deleteValue, listValues, setValue } from './cache';
import type { LabelRecord } from './types';

/**
 * Manual per-transaction labels/notes/screenshot links for the Taxes page - the actual Excel
 * replacement. Stored in the same Upstash Redis every other app here already uses for caching,
 * but WITHOUT a TTL: this is hand-entered data, not a re-fetchable cache entry, so nothing here
 * ever expires. (Upstash Redis is RDB-persistent by default, so this is a durable store, not just
 * a cache - see the "taxes" section of crypto/README.md for the tradeoffs against a real database.)
 */

const NAMESPACE = 'label';

export function listLabels(): Promise<Record<string, LabelRecord>> {
  return listValues<LabelRecord>(NAMESPACE);
}

export async function setLabel(id: string, record: Omit<LabelRecord, 'updatedAt'>): Promise<LabelRecord> {
  const full: LabelRecord = { ...record, updatedAt: new Date().toISOString() };
  await setValue(cacheKey(NAMESPACE, id), full);
  return full;
}

export function deleteLabel(id: string): Promise<void> {
  return deleteValue(cacheKey(NAMESPACE, id));
}
