import type { ApiResult, NetworkError, NetworkId } from './types';

export class ApiError extends Error {
  rateLimited: boolean;

  constructor(message: string, rateLimited: boolean) {
    super(message);
    this.rateLimited = rateLimited;
  }
}

export interface ApiResultWithNetworkErrors<T> {
  data: T;
  networkErrors: Partial<Record<NetworkId, NetworkError>>;
}

/** Shared SWR fetcher for this app's `{ data } | { error, rateLimited }` API route shape */
export async function fetchApiResult<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<T>;
  if ('error' in json && json.error) throw new ApiError(json.error as string, Boolean(json.rateLimited));
  return json.data as T;
}

/** Like fetchApiResult, but also surfaces per-network partial failures instead of discarding them */
export async function fetchApiResultWithNetworkErrors<T>(url: string): Promise<ApiResultWithNetworkErrors<T>> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<T>;
  if ('error' in json && json.error) throw new ApiError(json.error as string, Boolean(json.rateLimited));
  return { data: json.data as T, networkErrors: json.networkErrors ?? {} };
}
