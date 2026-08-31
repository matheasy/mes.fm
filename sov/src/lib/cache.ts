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

/** Every cache key this app writes is namespaced `sov:...` so one glob (`sov:*`) invalidates all of it */
export function cacheKey(namespace: string, ...parts: (string | number)[]): string {
  return ['sov', namespace, ...parts].join(':');
}

/**
 * Same-instance in-flight de-dup: if two callers ask for the same not-yet-cached key at nearly
 * the same moment (e.g. the portfolio, history, and transactions hooks all cold-loading on first
 * page load), only the first actually calls `fetcher` - the rest await that same promise.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Fetches `key` from Redis, or calls `fetcher` and stores the result with a TTL on miss. Falls
 * back to calling `fetcher` directly (no caching) if Redis isn't configured, so local dev works
 * without an Upstash account.
 */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    const redis = getClient();
    if (!redis) return fetcher();

    const hit = await redis.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;

    const value = await fetcher();
    await redis.set(key, value, { ex: ttlSeconds });
    return value;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Cross-instance rate limiting: claims a time-boxed slot via `SET key val NX PX minIntervalMs`, so
 * at most one caller across ALL serverless instances can proceed within any `minIntervalMs` window
 * for this key. Falls back to allowing immediately if Redis isn't configured (local dev), polling
 * every 50ms up to `maxWaitMs`. On timeout it throws rather than letting the caller through
 * unprotected - the caller's per-source error handling turns that into an isolated banner.
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

/** Drops every `sov:*` cache entry (but not the `sov:throttle:*` rate-limit slots) - backs the manual Refresh button */
export async function invalidateAll(): Promise<void> {
  const redis = getClient();
  if (!redis) return;

  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: 'sov:*', count: 100 });
    const purgeable = keys.filter((k) => !k.startsWith('sov:throttle:'));
    if (purgeable.length > 0) await redis.del(...purgeable);
    cursor = Number(nextCursor);
  } while (cursor !== 0);
}
