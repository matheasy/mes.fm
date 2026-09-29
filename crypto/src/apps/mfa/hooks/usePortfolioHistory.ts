'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/apps/mfa/lib/apiFetcher';
import { BASE_PATH } from '@/apps/mfa/lib/basePath';
import type { PortfolioValuePoint } from '@/apps/mfa/lib/ledger';

export function usePortfolioHistory() {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/portfolio/history`, (url: string) =>
    fetchApiResult<PortfolioValuePoint[]>(url),
  );

  return {
    history: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
