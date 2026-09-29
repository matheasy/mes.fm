'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/apps/mfa/lib/apiFetcher';
import { BASE_PATH } from '@/apps/mfa/lib/basePath';
import type { PortfolioSummary } from '@/apps/mfa/lib/types';

export function usePortfolio() {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/portfolio`, (url: string) =>
    fetchApiResult<PortfolioSummary>(url),
  );

  return {
    portfolio: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
