import { redisClient } from '../cache';
import type { TaxEntry } from '../tax/acb';
import { swapHiveGaps } from '../tax/sources/hiveEngine';
import {
  CHECKS_KEY,
  LOCK_KEY,
  SYNC_KEY,
  mergeSource,
  readMetas,
  readSource,
  summarizeData,
  writeMetaOnly,
  writeSource,
  type SourceMeta,
} from './ledgerStore';
import { FETCHER_FNS, FETCHERS, STORE_SOURCES, type FetchResult } from './storeSources';

/**
 * One sync: every fetcher runs in parallel (each with its own time limit), and each source it fills is
 * merged into its stored copy (ledgerStore.mergeSource) and written. Runs from the daily Vercel cron,
 * from the page when the last sync is more than a few hours old, and from the "Sync now" button. A lock
 * keeps two syncs from running at once; a sync that started less than MIN_GAP_MS ago is not repeated
 * (except a rebuild), so nobody can make the app hammer the APIs.
 */

const FETCH_LIMIT_MS = 240_000;
const MIN_GAP_MS = 3 * 60_000;

export interface SyncRun {
  startedAt: string;
  finishedAt: string | null;
  trigger: string;
  /** Per source: rows added, or the error, or that it was held for review */
  results: { id: string; added: number; error?: string; held?: number }[];
}

export interface SyncStatus {
  running: boolean;
  last: SyncRun | null;
  sources: SourceMeta[];
  /** Sources never synced successfully (no stored copy at all) */
  missing: string[];
  /** The oldest "last synced" over all sources - what the page shows */
  oldestSyncedAt: string | null;
  checks: StoreChecks | null;
}

export interface StoreChecks {
  at: string;
  /** SWAP.HIVE counted on Hive Engine but no longer in the account (sources/hiveEngine.ts) */
  hiveGaps: { account: string; missing: number }[];
}

function r() {
  const c = redisClient();
  if (!c) throw new Error('The database (Upstash Redis) is not configured');
  return c;
}

export async function syncStatus(): Promise<SyncStatus> {
  const ids = STORE_SOURCES.map((s) => s.id);
  const [metas, last, lock, checks] = await Promise.all([
    readMetas(ids),
    r().get<SyncRun>(SYNC_KEY),
    r().get<string>(LOCK_KEY),
    r().get<StoreChecks>(CHECKS_KEY),
  ]);
  const sources = metas.filter((m): m is SourceMeta => !!m);
  const missing = ids.filter((id, i) => !metas[i]?.syncedAt);
  const synced = sources.map((m) => m.syncedAt).filter((x): x is string => !!x).sort();
  return { running: !!lock, last: last ?? null, sources, missing, oldestSyncedAt: missing.length ? null : (synced[0] ?? null), checks: checks ?? null };
}

function withLimit<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} took longer than ${Math.round(ms / 1000)}s`)), ms))]);
}

async function syncSource(id: string, label: string, res: FetchResult[string] | undefined, prev: SourceMeta | null, rebuild: boolean, now: string): Promise<SyncRun['results'][number]> {
  const base: Omit<SourceMeta, 'gen' | 'chunks'> = {
    id,
    label,
    count: prev?.count ?? 0,
    txCount: prev?.txCount ?? 0,
    newest: prev?.newest ?? null,
    syncedAt: prev?.syncedAt ?? null,
    checkedAt: now,
    error: null,
    added: 0,
    held: prev?.held ?? null,
  };
  if (!res || 'error' in res) {
    const error = res && 'error' in res ? res.error : 'no answer';
    if (prev) await writeMetaOnly(id, { ...prev, checkedAt: now, error });
    else await writeMetaOnly(id, { ...base, error, gen: 0, chunks: 0 });
    return { id, added: 0, error };
  }
  const stored = prev?.chunks ? await readSource(id, prev) : null;
  const merged = mergeSource(stored, res.data, rebuild);
  const held = merged.missing.length ? { missing: merged.missing.length, at: now, sample: merged.missing.slice(0, 5) } : rebuild ? null : (prev?.held ?? null);
  await writeSource(id, merged.data, { ...base, ...summarizeData(merged.data), syncedAt: now, added: merged.added, held }, prev);
  return { id, added: merged.added, ...(merged.missing.length ? { held: merged.missing.length } : {}) };
}

export async function runSync(opts: { trigger: string; rebuild?: string[] }): Promise<{ started: boolean; reason?: string; run?: SyncRun }> {
  const redis = r();
  const last = await redis.get<SyncRun>(SYNC_KEY);
  if (!opts.rebuild?.length && last && Date.now() - Date.parse(last.startedAt) < MIN_GAP_MS) return { started: false, reason: 'a sync ran a moment ago' };
  const now = new Date().toISOString();
  const got = await redis.set(LOCK_KEY, now, { nx: true, ex: 290 });
  if (got !== 'OK') return { started: false, reason: 'a sync is already running' };

  const run: SyncRun = { startedAt: now, finishedAt: null, trigger: opts.trigger, results: [] };
  await redis.set(SYNC_KEY, run);
  try {
    const rebuild = new Set(opts.rebuild ?? []);
    const prevMetas = await readMetas(STORE_SOURCES.map((s) => s.id));
    const prevById = new Map(STORE_SOURCES.map((s, i) => [s.id, prevMetas[i] ?? null]));

    await Promise.all(
      FETCHERS.map(async (f) => {
        let res: FetchResult;
        try {
          res = await withLimit(FETCHER_FNS[f]!(), FETCH_LIMIT_MS, f);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'failed to load';
          res = Object.fromEntries(STORE_SOURCES.filter((s) => s.fetcher === f).map((s) => [s.id, { error: message }]));
        }
        for (const s of STORE_SOURCES.filter((x) => x.fetcher === f)) {
          try {
            run.results.push(await syncSource(s.id, s.label, res[s.id], prevById.get(s.id) ?? null, rebuild.has(s.id), now));
          } catch (err) {
            run.results.push({ id: s.id, added: 0, error: err instanceof Error ? err.message : 'could not be stored' });
          }
        }
      }),
    );

    // the SWAP.HIVE reconciliation needs the stored Hive Engine + TGLD rows together (it used to run on every report)
    try {
      const [he, tgld] = await Promise.all([readSource('hive-engine'), readSource('tgld')]);
      const entries: TaxEntry[] = [...(he?.tax ?? []), ...(tgld?.tax ?? [])];
      if (entries.length) await redis.set(CHECKS_KEY, { at: now, hiveGaps: await swapHiveGaps(entries) } satisfies StoreChecks);
    } catch {
      // only a check; the next sync tries again
    }
  } finally {
    run.finishedAt = new Date().toISOString();
    run.results.sort((a, b) => a.id.localeCompare(b.id));
    await redis.set(SYNC_KEY, run);
    await redis.del(LOCK_KEY);
  }
  return { started: true, run };
}
