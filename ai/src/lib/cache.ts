import { Redis } from '@upstash/redis';

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
 * Fetches `key` from Redis, or calls `fetcher` and stores the result with a TTL on miss.
 * Falls back to calling `fetcher` directly (no caching) if Redis isn't configured, so local
 * dev works without an Upstash account.
 */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const redis = getClient();
  if (!redis) return fetcher();

  const hit = await redis.get<T>(key);
  if (hit !== null && hit !== undefined) return hit;

  const value = await fetcher();
  await redis.set(key, value, { ex: ttlSeconds });
  return value;
}

/**
 * Cross-instance rate limiting: claims a time-boxed slot via `SET key val NX PX minIntervalMs`, so
 * at most one caller across ALL serverless instances can proceed within any `minIntervalMs` window
 * for this key - an in-process-only throttle (a plain in-memory queue) doesn't help here, since
 * Vercel can run concurrent requests to different routes in separate instances that don't share
 * module state. Falls back to allowing immediately if Redis isn't configured (local dev - matches
 * `cached()`'s fallback), polling every 50ms up to `maxWaitMs` before giving up.
 */
export async function acquireGlobalSlot(key: string, minIntervalMs: number, maxWaitMs = 8000): Promise<void> {
  const redis = getClient();
  if (!redis) return;

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const claimed = await redis.set(key, '1', { nx: true, px: minIntervalMs });
    if (claimed) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
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
