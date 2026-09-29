import type { ApiResult } from './types';

export class ApiError extends Error {
  rateLimited: boolean;

  constructor(message: string, rateLimited: boolean) {
    super(message);
    this.rateLimited = rateLimited;
  }
}

/** Shared SWR fetcher for this app's `{ data } | { error, rateLimited }` API route shape */
export async function fetchApiResult<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as ApiResult<T>;
  if ('error' in json && json.error) throw new ApiError(json.error as string, Boolean(json.rateLimited));
  return json.data as T;
}
