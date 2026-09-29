import { NextResponse } from 'next/server';
import { invalidateForRefresh } from '@/apps/assets/lib/cache';
import type { ApiResult } from '@/apps/assets/lib/types';

export const maxDuration = 300;

export async function POST() {
  try {
    await invalidateForRefresh();
    return NextResponse.json({ data: { refreshed: true } } satisfies ApiResult<{ refreshed: boolean }>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to refresh cache';
    return NextResponse.json({ error: message } satisfies ApiResult<{ refreshed: boolean }>, { status: 502 });
  }
}
