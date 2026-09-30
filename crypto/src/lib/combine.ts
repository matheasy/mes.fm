import { WALLET_SOURCES, sourceUrl, type WalletSource } from './sources';
import type { ApiResult } from './types';

export interface SourceResult<T> {
  source: WalletSource;
  data: T | null;
  error: string | null;
  rateLimited: boolean;
  /** Networks the upstream couldn't load (its `networkErrors`): `data` is then missing their part */
  networkErrors?: Record<string, string>;
}

/**
 * Fetches one upstream wallet app's API route. Never throws - a failure (network error, upstream
 * rate limit, upstream outage) comes back as a settled result with `data: null`, so one wallet
 * being unavailable doesn't take down the combined view for the other.
 */
export async function fetchSource<T>(source: WalletSource, path: string): Promise<SourceResult<T>> {
  try {
    // give up before this function's own 300s limit, so a stuck upstream shows as that source's error
    // instead of the whole request hanging
    const res = await fetch(sourceUrl(source, path), { cache: 'no-store', signal: AbortSignal.timeout(240_000) });
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
    const raw = (json as { networkErrors?: Record<string, { message?: string } | string> }).networkErrors ?? {};
    const networkErrors = Object.fromEntries(
      Object.entries(raw).map(([n, e]) => [n, typeof e === 'string' ? e : (e?.message ?? 'failed to load')]),
    );
    return { source, data: (json.data as T) ?? null, error: null, rateLimited: false, networkErrors };
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to reach ${source.label}`;
    return { source, data: null, error: message, rateLimited: false };
  }
}

export function fetchAllSources<T>(path: string): Promise<SourceResult<T>[]> {
  return Promise.all(WALLET_SOURCES.map((source) => fetchSource<T>(source, path)));
}
