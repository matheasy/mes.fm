import { NextResponse } from 'next/server';
import { WALLET_SOURCES } from '@/lib/sources';
import type { ApiResult } from '@/lib/types';

export async function POST() {
  const results = await Promise.allSettled(
    WALLET_SOURCES.map((source) => fetch(`${source.apiBaseUrl}/api/refresh`, { method: 'POST' })),
  );
  const anyOk = results.some((r) => r.status === 'fulfilled' && r.value.ok);

  if (!anyOk) {
    return NextResponse.json(
      { error: 'Failed to refresh either wallet' } satisfies ApiResult<{ refreshed: boolean }>,
      { status: 502 },
    );
  }

  return NextResponse.json({ data: { refreshed: true } } satisfies ApiResult<{ refreshed: boolean }>);
}
