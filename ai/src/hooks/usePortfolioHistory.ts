'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { PortfolioValuePoint } from '@/lib/ledger';
import type { NetworkId } from '@/lib/types';

export function usePortfolioHistory(network?: NetworkId) {
  const qs = network ? `?network=${network}` : '';
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/portfolio/history${qs}`, (url: string) =>
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
