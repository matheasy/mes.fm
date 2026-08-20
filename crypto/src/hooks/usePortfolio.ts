'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { CombinedPortfolio } from '@/lib/types';

export function usePortfolio() {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/portfolio`, (url: string) =>
    fetchApiResult<CombinedPortfolio>(url),
  );

  return {
    portfolio: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
