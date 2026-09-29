import { acquireGlobalSlot } from '../cache';

/**
 * Wraps a client's request function so every call - across every serverless instance, not just
 * within one warm process - is spaced at least `minIntervalMs` apart for the given `key`. Backed
 * by `acquireGlobalSlot()`'s Redis lock; degrades to no throttling in local dev without Redis
 * configured, same as the rest of this app's caching.
 */
export function createThrottle(key: string, minIntervalMs: number) {
  return async function throttle<T>(fn: () => Promise<T>): Promise<T> {
    await acquireGlobalSlot(`mfa:throttle:${key}`, minIntervalMs);
    return fn();
  };
}
