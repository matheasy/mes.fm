import { NextResponse } from 'next/server';
import { remember, storedAnswer } from '@/lib/store/lastSeen';
import { cached, cacheKey } from '@/lib/cache';
import { apiErrorResponse } from '@/lib/errors';
import { tokensSnapshot } from '@/lib/cashTokens';
import type { ApiResult, BucketSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** GET /api/tokens - mes.fm/tokens's data, picked out of mes.fm/assets' snapshot (see lib/cashTokens.ts) */
export async function GET(request: Request) {
  const stored = await storedAnswer(request, 'tokens');
  if (stored) return stored;
  try {
    const data = await cached<BucketSnapshot>(cacheKey('tokens-snapshot'), tokensSnapshot, 300);
    await remember('tokens', data);
    return NextResponse.json({ data } satisfies ApiResult<BucketSnapshot>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load the Tokens holdings');
  }
}
