'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/apps/assets/lib/apiFetcher';
import { BASE_PATH } from '@/apps/assets/lib/basePath';
import type { AssetsSnapshot } from '@/apps/assets/lib/types';

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
