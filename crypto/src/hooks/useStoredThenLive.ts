'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';

/**
 * Shows the dashboard's last saved numbers at once (`?stored=1`, see lib/store/lastSeen.ts) while the
 * live answer (fresh prices and balances) loads, then swaps it in. `stale` = what is shown is the saved
 * copy from `savedAt`; `updating` = the live answer is still on its way.
 */
export function useStoredThenLive<T>(path: string) {
  const url = `${BASE_PATH}${path}`;
  const live = useSWR(url, (u: string) => fetchApiResult<T>(u));
  const stored = useSWR(live.data ? null : `${url}${url.includes('?') ? '&' : '?'}stored=1`, (u: string) => fetchApiResult<{ savedAt: string; data: T } | null>(u), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const saved = stored.data ?? null;
  const data = live.data ?? saved?.data;
  return {
    data,
    stale: !live.data && !!saved,
    savedAt: !live.data ? (saved?.savedAt ?? null) : null,
    updating: live.isLoading || live.isValidating,
    isLoading: !data && (live.isLoading || stored.isLoading),
    error: live.error instanceof Error ? live.error.message : null,
    rateLimited: live.error instanceof ApiError && live.error.rateLimited,
    refresh: () => live.mutate(),
  };
}
