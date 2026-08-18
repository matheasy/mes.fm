'use client';

import useSWR from 'swr';
import { BASE_PATH } from '@/lib/basePath';
import type { PortfolioValuePoint } from '@/lib/ledger';
import type { ApiResult } from '@/lib/types';

async function fetcher(url: string): Promise<PortfolioValuePoint[]> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<PortfolioValuePoint[]>;
  if ('error' in json) throw new Error(json.error);
  return json.data;
}

export function usePortfolioHistory() {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/portfolio/history`, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  });

  return {
    history: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
  };
}
