import { WALLET_SOURCES, sourceUrl, type WalletSource } from './sources';
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
    const res = await fetch(sourceUrl(source, path), { cache: 'no-store' });
    // A missing deployment answers with a plain-text/HTML page, not our JSON: say so plainly
    // instead of surfacing JSON.parse's "Unexpected token" message.
    if (!(res.headers.get('content-type') ?? '').includes('json')) {
      const notDeployed = res.headers.get('x-vercel-error') === 'DEPLOYMENT_NOT_FOUND';
      const msg = notDeployed ? `${source.label} is not deployed right now` : `${source.label} did not answer (HTTP ${res.status})`;
      return { source, data: null, error: msg, rateLimited: false };
    }
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
