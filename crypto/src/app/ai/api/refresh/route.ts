import { NextResponse } from 'next/server';
import { invalidateByWallet } from '@/apps/ai/lib/cache';
import type { ApiResult } from '@/apps/ai/lib/types';
import { currentWallet, withWallet } from '@/apps/ai/lib/walletContext';

export async function POST(request: Request) {
  return withWallet(request, async () => {
    try {
      await invalidateByWallet(currentWallet().address);
      return NextResponse.json({ data: { refreshed: true } } satisfies ApiResult<{ refreshed: boolean }>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh cache';
      return NextResponse.json({ error: message } satisfies ApiResult<{ refreshed: boolean }>, { status: 502 });
    }
  });
}
