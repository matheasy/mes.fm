'use client';

import useSWR from 'swr';
import { BASE_PATH } from '@/lib/basePath';
import type { ApiResult, PortfolioSummary } from '@/lib/types';

async function fetcher(url: string): Promise<PortfolioSummary> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<PortfolioSummary>;
  if ('error' in json) throw new Error(json.error);
  return json.data;
}

export function usePortfolio() {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/portfolio`, fetcher, {
    revalidateOnFocus: false,
  });

  return {
    portfolio: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
  };
}
