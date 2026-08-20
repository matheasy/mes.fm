'use client';

import useSWR from 'swr';
import type { CombinedGainsResponse } from '@/app/api/gains/route';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { CostBasisMethod } from '@/lib/accounting/types';

export function useGains(method: CostBasisMethod) {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/gains?method=${method}`, (url: string) =>
    fetchApiResult<CombinedGainsResponse>(url),
  );

  return {
    gains: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
