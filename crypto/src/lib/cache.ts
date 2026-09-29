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

/** Every key this app writes is namespaced `portfolio:...` so one glob (`portfolio:*`) covers all of it */
export function cacheKey(namespace: string, ...parts: (string | number)[]): string {
  return ['portfolio', namespace, ...parts].join(':');
}

/**
 * Fetches `key` from Redis, or calls `fetcher` and stores the result on miss. `ttlSeconds` is
 * optional - omit it for values that never change once written (e.g. a published historical
 * exchange rate) so they're never re-fetched. Falls back to calling `fetcher` directly (no
 * caching) if Redis isn't configured, so local dev works without an Upstash account.
 */
export async function cached<T>(key: string, fetcher: () => Promise<T>, ttlSeconds?: number): Promise<T> {
  const redis = getClient();
  if (!redis) return fetcher();

  const hit = await redis.get<T>(key);
  if (hit !== null && hit !== undefined) return hit;

  const value = await fetcher();
  if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
  else await redis.set(key, value);
  return value;
}

/** Direct read/write for user-entered data (labels) - no TTL, ever; this is the only copy. */
export async function getValue<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  const v = await redis.get<T>(key);
  return v ?? null;
}

/** Several keys in one round trip (missing keys come back null) */
export async function getValues<T>(keys: string[]): Promise<(T | null)[]> {
  const redis = getClient();
  if (!redis || keys.length === 0) return keys.map(() => null);
  const out: (T | null)[] = [];
  for (let i = 0; i < keys.length; i += 500) {
    const chunk = await redis.mget<(T | null)[]>(...keys.slice(i, i + 500));
    out.push(...chunk.map((v) => v ?? null));
  }
  return out;
}

export async function setValue<T>(key: string, value: T): Promise<void> {
  const redis = getClient();
  if (!redis) return; // local dev without Redis configured: writes are accepted but not persisted
  await redis.set(key, value);
}

export async function deleteValue(key: string): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  await redis.del(key);
}

/** All keys under one namespace prefix (e.g. every label) - used to list labels for the export/table */
export async function listValues<T>(namespace: string): Promise<Record<string, T>> {
  const redis = getClient();
  if (!redis) return {};
  const out: Record<string, T> = {};
  let cursor = 0;
  const prefix = cacheKey(namespace, '');
  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: `${prefix}*`, count: 100 });
    if (keys.length) {
      const values = await Promise.all(keys.map((k) => redis.get<T>(k)));
      keys.forEach((k, i) => {
        const v = values[i];
        if (v !== null && v !== undefined) out[k.slice(prefix.length)] = v;
      });
    }
    cursor = Number(nextCursor);
  } while (cursor !== 0);
  return out;
}
