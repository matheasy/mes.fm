'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { PortfolioValuePoint } from '@/lib/types';

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
