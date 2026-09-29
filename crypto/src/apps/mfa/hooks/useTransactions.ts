'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResult } from '@/apps/mfa/lib/apiFetcher';
import { BASE_PATH } from '@/apps/mfa/lib/basePath';
import type { Transaction, TransactionFilters } from '@/apps/mfa/lib/types';

function buildQuery(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.token) params.set('token', filters.token);
  if (filters.type) params.set('type', filters.type);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useTransactions(filters: TransactionFilters) {
  const { data, error, isLoading, mutate } = useSWR(
    `${BASE_PATH}/api/transactions${buildQuery(filters)}`,
    (url: string) => fetchApiResult<Transaction[]>(url),
  );

  return {
    transactions: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
