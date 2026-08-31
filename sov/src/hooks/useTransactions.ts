'use client';

import useSWR from 'swr';
import { ApiError, fetchApiResultWithNetworkErrors } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { Transaction, TransactionFilters } from '@/lib/types';

function buildQuery(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.token) params.set('token', filters.token);
  if (filters.type) params.set('type', filters.type);
  if (filters.network) params.set('network', filters.network);
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useTransactions(filters: TransactionFilters) {
  const { data, error, isLoading, mutate } = useSWR(
    `${BASE_PATH}/api/transactions${buildQuery(filters)}`,
    (url: string) => fetchApiResultWithNetworkErrors<Transaction[]>(url),
  );

  return {
    transactions: data?.data ?? [],
    networkErrors: data?.networkErrors ?? {},
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
