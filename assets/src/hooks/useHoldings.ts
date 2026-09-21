'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { AssetsSnapshot } from '@/lib/types';

export function useHoldings(minValueUsd: number) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(`${BASE_PATH}/api/holdings?minValueUsd=${minValueUsd}`, (url: string) =>
    fetchApiResult<AssetsSnapshot>(url),
  );

  return {
    snapshot: data,
    isLoading,
    isValidating,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
