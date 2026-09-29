'use client';

import useSWR from 'swr';
import type { TaxesResponse } from '@/app/api/taxes/route';
import { ApiError, fetchApiResult } from '@/lib/apiFetcher';
import { BASE_PATH } from '@/lib/basePath';
import type { CostBasisMethod } from '@/lib/accounting/types';
import type { WalletKey } from '@/lib/wallets';

export function useTaxes(method: CostBasisMethod, wallet?: WalletKey) {
  const qs = wallet ? `&wallet=${wallet}` : '';
  const { data, error, isLoading, mutate } = useSWR(`${BASE_PATH}/api/taxes?method=${method}${qs}`, (url: string) =>
    fetchApiResult<TaxesResponse>(url),
  );

  return {
    taxes: data,
    isLoading,
    error: error instanceof Error ? error.message : null,
    rateLimited: error instanceof ApiError && error.rateLimited,
    refresh: () => mutate(),
  };
}
