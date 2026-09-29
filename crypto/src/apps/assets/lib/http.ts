import { RateLimitError } from './errors';
import { acquireGlobalSlot } from './cache';

export interface FetchOpts {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** Space calls to this key at least this far apart, across every serverless instance (needs Redis) and within this one */
  throttle?: { key: string; minIntervalMs: number };
}

const lastCall = new Map<string, number>();

async function throttleLocal(key: string, minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const next = Math.max(now, (lastCall.get(key) ?? 0) + minIntervalMs);
  lastCall.set(key, next);
  if (next > now) await new Promise((r) => setTimeout(r, next - now));
}

/**
 * JSON fetch with a timeout, a retry on 429/5xx (honouring Retry-After), and optional per-key
 * spacing. Throws RateLimitError when a provider keeps answering 429.
 */
export async function fetchJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, timeoutMs = 20_000, retries = 2, throttle } = opts;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (throttle) {
      await throttleLocal(throttle.key, throttle.minIntervalMs);
      await acquireGlobalSlot(`assets:throttle:${throttle.key}`, throttle.minIntervalMs);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'mes-fm-assets/1.0', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        signal: ctrl.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        lastErr = res.status === 429 ? new RateLimitError(`${new URL(url).host} rate limit reached (429)`) : new Error(`${new URL(url).host} responded ${res.status}`);
        if (attempt < retries) {
          const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 600 * 2 ** attempt;
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);

      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof RateLimitError) throw err;
      lastErr = err;
      const aborted = err instanceof Error && err.name === 'AbortError';
      if (attempt < retries && (aborted || (err instanceof Error && /fetch failed|network|ECONN|ETIMEDOUT/i.test(err.message)))) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      throw aborted ? new Error(`${new URL(url).host} timed out after ${timeoutMs}ms`) : err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('request failed');
}
