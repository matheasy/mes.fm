import { WALLET_SOURCES, type WalletSource } from './sources';
import type { ApiResult } from './types';

export interface SourceResult<T> {
  source: WalletSource;
  data: T | null;
  error: string | null;
  rateLimited: boolean;
}

/**
 * Fetches one upstream wallet app's API route. Never throws - a failure (network error, upstream
 * rate limit, upstream outage) comes back as a settled result with `data: null`, so one wallet
 * being unavailable doesn't take down the combined view for the other.
 */
export async function fetchSource<T>(source: WalletSource, path: string): Promise<SourceResult<T>> {
  try {
    const res = await fetch(`${source.apiBaseUrl}${path}`, { cache: 'no-store' });
    const json = (await res.json()) as ApiResult<T>;
    if ('error' in json && json.error) {
      return { source, data: null, error: json.error, rateLimited: Boolean(json.rateLimited) };
    }
    return { source, data: (json.data as T) ?? null, error: null, rateLimited: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to reach ${source.label}`;
    return { source, data: null, error: message, rateLimited: false };
  }
}

export function fetchAllSources<T>(path: string): Promise<SourceResult<T>[]> {
  return Promise.all(WALLET_SOURCES.map((source) => fetchSource<T>(source, path)));
}
