import { NextResponse } from 'next/server';

/** Thrown when an upstream provider (Moralis, CoinGecko) rejects a request for being rate/quota limited */
export class RateLimitError extends Error {}

/** Shared API route error handler - flags rate-limit errors so the client can fall back to stale data instead of a hard error */
export function apiErrorResponse(err: unknown, fallbackMessage: string) {
  const rateLimited = err instanceof RateLimitError;
  const message = err instanceof Error ? err.message : fallbackMessage;
  return NextResponse.json({ error: message, rateLimited }, { status: rateLimited ? 429 : 502 });
}
