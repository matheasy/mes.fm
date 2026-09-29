import { NextResponse } from 'next/server';
import { invalidateByWallet } from '@/apps/mfa/lib/cache';
import { WALLET_ADDRESS } from '@/apps/mfa/lib/config';
import type { ApiResult } from '@/apps/mfa/lib/types';

export async function POST() {
  try {
    await invalidateByWallet(WALLET_ADDRESS);
    return NextResponse.json({ data: { refreshed: true } } satisfies ApiResult<{ refreshed: boolean }>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to refresh cache';
    return NextResponse.json({ error: message } satisfies ApiResult<{ refreshed: boolean }>, { status: 502 });
  }
}
