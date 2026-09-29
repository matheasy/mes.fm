import { NextResponse } from 'next/server';
import { WALLET_SOURCES, sourceUrl } from '@/lib/sources';
import type { ApiResult } from '@/lib/types';

export const maxDuration = 300;

export async function POST() {
  const results = await Promise.allSettled(
    WALLET_SOURCES.map((source) => fetch(sourceUrl(source, '/api/refresh'), { method: 'POST' })),
  );
  const anyOk = results.some((r) => r.status === 'fulfilled' && r.value.ok);

  if (!anyOk) {
    return NextResponse.json(
      { error: 'Failed to refresh any wallet' } satisfies ApiResult<{ refreshed: boolean }>,
      { status: 502 },
    );
  }

  return NextResponse.json({ data: { refreshed: true } } satisfies ApiResult<{ refreshed: boolean }>);
}
