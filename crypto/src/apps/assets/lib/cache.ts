import { Redis } from '@upstash/redis';
import { RateLimitError } from './errors';

let client: Redis | null = null;

function getClient(): Redis | null {
  if (client) return client;

  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  client = new Redis({ url, token });
  return client;
}

/** Every cache key this app writes is namespaced `assets:...` so one glob (`assets:*`) invalidates all of it */
export function cacheKey(namespace: string, ...parts: (string | number)[]): string {
  return ['assets', namespace, ...parts].join(':');
}

/**
 * Per-process fallback store: local dev without Redis (so a page refresh doesn't re-hit every
 * upstream API) and a warm-instance read-through in production.
 */
const memory = new Map<string, { v: unknown; exp: number }>();

async function rawGet<T>(key: string): Promise<T | null> {
  const m = memory.get(key);
  if (m && m.exp > Date.now()) return m.v as T;

  const redis = getClient();
  if (!redis) return null;
  const hit = await redis.get<T>(key);
  return hit ?? null;
}

async function rawSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  memory.set(key, { v: value, exp: Date.now() + ttlSeconds * 1000 });
  const redis = getClient();
  if (redis) await redis.set(key, value, { ex: ttlSeconds });
}

const inFlight = new Map<string, Promise<unknown>>();

/** De-dupes concurrent callers for the same key within one instance */
async function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn();
  inFlight.set(key, p);
  try {
    return await p;
  } finally {
    inFlight.delete(key);
  }
}

/** Plain read-through cache with a TTL. */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = await rawGet<T>(key);
  if (hit !== null && hit !== undefined) return hit;

  return dedupe(key, async () => {
    const value = await fetcher();
    await rawSet(key, value, ttlSeconds);
    return value;
  });
}

export interface StaleResult<T> {
  value: T;
  /** True when the upstream fetch failed and this is the last good copy */
  stale: boolean;
  fetchedAt: number;
  error?: Error;
}

interface Stamped<T> {
  v: T;
  t: number;
}

const STALE_KEEP_SECONDS = 7 * 24 * 60 * 60;

/**
 * Read-through cache that survives upstream outages: serves the cached copy while it is younger
 * than `freshSeconds`; past that it re-fetches, and if the re-fetch throws it falls back to the
 * last good copy (flagged `stale`) instead of blanking the dashboard. Keeps the last good copy
 * for a week.
 */
export async function cachedStale<T>(key: string, freshSeconds: number, fetcher: () => Promise<T>): Promise<StaleResult<T>> {
  const prior = await rawGet<Stamped<T>>(key);
  if (prior && Date.now() - prior.t < freshSeconds * 1000) {
    return { value: prior.v, stale: false, fetchedAt: prior.t };
  }

  try {
    const value = await dedupe(key, fetcher);
    const t = Date.now();
    await rawSet(key, { v: value, t } satisfies Stamped<T>, STALE_KEEP_SECONDS);
    return { value, stale: false, fetchedAt: t };
  } catch (err) {
    if (prior) return { value: prior.v, stale: true, fetchedAt: prior.t, error: err instanceof Error ? err : new Error(String(err)) };
    throw err;
  }
}

/**
 * Cross-instance rate limiting: claims a time-boxed slot via `SET key val NX PX minIntervalMs`, so
 * at most one caller across ALL serverless instances proceeds within any `minIntervalMs` window for
 * this key. No-op without Redis (local dev).
 */
export async function acquireGlobalSlot(key: string, minIntervalMs: number, maxWaitMs = 30_000): Promise<void> {
  const redis = getClient();
  if (!redis) return;

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const claimed = await redis.set(key, '1', { nx: true, px: minIntervalMs });
    if (claimed) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new RateLimitError(`Timed out waiting for a rate-limit slot on "${key}"`);
}

/**
 * Backs the manual Refresh button: drops cached holdings and prices but deliberately KEEPS the
 * slow-changing discovery caches (`assets:discovery:*`, BNB Chain token lists) and rate-limit slots,
 * so pressing Refresh never re-spends the expensive NodeReal history scan.
 */
export async function invalidateForRefresh(): Promise<void> {
  for (const key of [...memory.keys()]) {
    if (!key.startsWith('assets:discovery:') && !key.startsWith('assets:throttle:')) memory.delete(key);
  }

  const redis = getClient();
  if (!redis) return;

  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: 'assets:*', count: 200 });
    const purgeable = keys.filter((k) => !k.startsWith('assets:discovery:') && !k.startsWith('assets:throttle:'));
    if (purgeable.length > 0) await redis.del(...purgeable);
    cursor = Number(nextCursor);
  } while (cursor !== 0);
}

/** Direct set with TTL for callers that manage their own batching (price lookups) */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await rawSet(key, value, ttlSeconds);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  return rawGet<T>(key);
}
