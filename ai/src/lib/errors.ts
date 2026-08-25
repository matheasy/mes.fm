import { NextResponse } from 'next/server';
import type { NetworkError } from './types';

/** Thrown when an upstream provider (Moralis, Etherscan, CoinGecko, Hyperliquid) rejects a request for being rate/quota limited */
export class RateLimitError extends Error {}

/** Shared API route error handler - flags rate-limit errors so the client can fall back to stale data instead of a hard error */
export function apiErrorResponse(err: unknown, fallbackMessage: string) {
  const rateLimited = err instanceof RateLimitError;
  const message = err instanceof Error ? err.message : fallbackMessage;
  return NextResponse.json({ error: message, rateLimited }, { status: rateLimited ? 429 : 502 });
}

/** Converts a caught per-network fetch failure into the shape carried in `ApiResult.networkErrors` */
export function describeNetworkError(err: unknown, fallbackMessage: string): NetworkError {
  return {
    message: err instanceof Error ? err.message : fallbackMessage,
    rateLimited: err instanceof RateLimitError,
  };
}
