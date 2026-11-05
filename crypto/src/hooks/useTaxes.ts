'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { TaxesResponse } from '@/lib/types';
import type { Section } from '@/lib/sections';

export function taxesQuery(year?: number, section?: Section): string {
  const qs = new URLSearchParams();
  if (year) qs.set('year', String(year));
  if (section) qs.set('section', section);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function useTaxes(year?: number, section?: Section) {
  const { data, error, isLoading, mutate } = useSWR(
    `${BASE_PATH}/api/taxes${taxesQuery(year, section)}`,
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
