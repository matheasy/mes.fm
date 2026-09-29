'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { TaxesResponse } from '@/lib/types';
import type { TaxGroup } from '@/lib/tax/taxSources';

export function taxesQuery(year?: number, wallet?: TaxGroup): string {
  const qs = new URLSearchParams();
  if (year) qs.set('year', String(year));
  if (wallet) qs.set('wallet', wallet);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function useTaxes(year?: number, wallet?: TaxGroup) {
  const { data, error, isLoading, mutate } = useSWR(
    `${BASE_PATH}/api/taxes${taxesQuery(year, wallet)}`,
    (url: string) => fetchApiResult<TaxesResponse>(url),
    { keepPreviousData: true },
  );

  return {
    taxes: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
