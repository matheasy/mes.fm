import { NextResponse } from 'next/server';
import { invalidateAll } from '@/lib/cache';
import type { ApiResult } from '@/lib/types';

export async function POST() {
  try {
    await invalidateAll();
    return NextResponse.json({ data: { refreshed: true } } satisfies ApiResult<{ refreshed: boolean }>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to refresh cache';
    return NextResponse.json({ error: message } satisfies ApiResult<{ refreshed: boolean }>, { status: 502 });
  }
}
