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

/**
 * When a key includes a network segment, it MUST come after `wallet` (e.g.
 * `cacheKey('rawwallet', WALLET_ADDRESS, network)`), never before - `walletCacheKeyPattern()`'s
 * glob only matches `mfa:<namespace>:<wallet>*`, so a network segment inserted before the wallet
 * would silently escape invalidation on refresh.
 */
export function cacheKey(namespace: string, ...parts: (string | number)[]): string {
  return ['mfa', namespace, ...parts].join(':');
}

/** Wallet-scoped keys always look like `mfa:<namespace>:<wallet>[:...]`, so this glob catches all of them */
export function walletCacheKeyPattern(wallet: string): string {
  return `mfa:*:${wallet}*`;
}

/**
 * Same-instance in-flight de-dup: if two callers ask for the same not-yet-cached key at nearly
 * the same moment (e.g. the portfolio, history, and transactions hooks all cold-loading Ethereum
 * data on first page load), only the first actually calls `fetcher` - the rest await that same
 * promise instead of racing it. Doesn't coordinate across separate serverless instances (see
 * acquireGlobalSlot() below for that), but cuts a real source of redundant upstream calls within
 * one warm process, which is often where concurrent requests from one page load land.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Fetches `key` from Redis, or calls `fetcher` and stores the result with a TTL on miss.
 * Falls back to calling `fetcher` directly (no caching) if Redis isn't configured, so local
 * dev works without an Upstash account.
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
 * for this key - an in-process-only throttle (a plain in-memory queue) doesn't help here, since
 * Vercel can run concurrent requests to different routes in separate instances that don't share
 * module state. Falls back to allowing immediately if Redis isn't configured (local dev - matches
 * `cached()`'s fallback), polling every 50ms up to `maxWaitMs`.
 *
 * On timeout this throws rather than letting the caller through unprotected - a queue deep enough
 * to time out (e.g. two networks' worth of paginated calls all waiting their turn) is exactly the
 * case where bypassing the lock would reintroduce the burst this exists to prevent. The caller's
 * existing per-network error handling turns this into an isolated "rate limited" banner, not a
 * crash - see errors.ts's RateLimitError / ledger.ts's per-network Promise.allSettled.
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

export async function invalidateByWallet(wallet: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;

  const pattern = walletCacheKeyPattern(wallet);
  let cursor = 0;
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: pattern, count: 100 });
    if (keys.length > 0) await redis.del(...keys);
    cursor = Number(nextCursor);
  } while (cursor !== 0);
}
