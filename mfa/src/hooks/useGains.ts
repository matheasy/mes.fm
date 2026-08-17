'use client';

import useSWR from 'swr';
import type { GainsResponse } from '@/app/api/gains/route';
import { BASE_PATH } from '@/lib/basePath';
import type { CostBasisMethod } from '@/lib/accounting/types';
import type { ApiResult } from '@/lib/types';

async function fetcher(url: string): Promise<GainsResponse> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<GainsResponse>;
  if ('error' in json) throw new Error(json.error);
  return json.data;
}

export function useGains(method: CostBasisMethod) {
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/gains?method=${method}`, fetcher, {
    revalidateOnFocus: false,
  });

  return {
    gains: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
  };
}
