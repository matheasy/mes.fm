'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResultWithNetworkErrors } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { NetworkId, PortfolioSummary } from '@/lib/types';

export function usePortfolio(network?: NetworkId) {
  const qs = network ? `?network=${network}` : '';
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/portfolio${qs}`, (url: string) =>
    fetchApiResultWithNetworkErrors<PortfolioSummary>(url),
  );

  return {
    portfolio: data?.data,
    networkErrors: data?.networkErrors ?? {},
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
