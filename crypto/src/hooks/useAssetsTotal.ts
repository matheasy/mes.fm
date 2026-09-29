'use client';

import useSWR from 'swr';
import { fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { AssetsTotal } from '@/lib/types';

export function useAssetsTotal() {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/assets`, (url: string) => fetchApiResult<AssetsTotal>(url));

  return {
    assets: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
  };
}
