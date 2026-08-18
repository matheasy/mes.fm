'use client';

import useSWR from 'swr';
import { BASE_PATH } from '@/lib/basePath';
import type { ApiResult, Transaction, TransactionFilters } from '@/lib/types';

async function fetcher(url: string): Promise<Transaction[]> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<Transaction[]>;
  if ('error' in json) throw new Error(json.error);
  return json.data;
}

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
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/transactions${buildQuery(filters)}`, fetcher);

  return {
    transactions: data ?? [],
    isLoading,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
  };
}
