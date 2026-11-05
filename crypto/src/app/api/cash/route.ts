import { NextResponse } from 'next/server';
import { remember, storedAnswer } from '@/lib/store/lastSeen';
import { cached, cacheKey } from '@/lib/cache';
import { apiErrorResponse } from '@/lib/errors';
import { cashSnapshot } from '@/lib/cashTokens';
import type { ApiResult, BucketSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** GET /api/cash - mes.fm/cash's data, picked out of mes.fm/assets' snapshot (see lib/cashTokens.ts) */
export async function GET(request: Request) {
  const stored = await storedAnswer(request, 'cash');
  if (stored) return stored;
  try {
    const data = await cached<BucketSnapshot>(cacheKey('cash-snapshot'), cashSnapshot, 300);
    await remember('cash', data);
    return NextResponse.json({ data } satisfies ApiResult<BucketSnapshot>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load the Cash holdings');
  }
}
