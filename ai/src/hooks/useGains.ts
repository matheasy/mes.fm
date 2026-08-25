'use client';

import useSWR from 'swr';
import type { GainsResponse } from '@/app/api/gains/route';
import { ApiError, fetchApiResultWithNetworkErrors } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { CostBasisMethod } from '@/lib/accounting/types';
import type { NetworkId } from '@/lib/types';

export function useGains(method: CostBasisMethod, network?: NetworkId) {
  const qs = network ? `&network=${network}` : '';
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/gains?method=${method}${qs}`, (url: string) =>
    fetchApiResultWithNetworkErrors<GainsResponse>(url),
  );

  return {
    gains: data?.data,
    networkErrors: data?.networkErrors ?? {},
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
