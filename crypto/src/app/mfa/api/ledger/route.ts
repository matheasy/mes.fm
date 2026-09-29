import { NextResponse } from 'next/server';
import { WALLET_ADDRESS } from '@/apps/mfa/lib/config';
import { apiErrorResponse } from '@/apps/mfa/lib/errors';
import { getPricedTransactions } from '@/apps/mfa/lib/ledger';
import type { ApiResult } from '@/apps/mfa/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Same shape as ai/'s /api/ledger (this app is BNB Chain only, so every entry gets network 'bsc') */
interface LedgerEntry {
  hash: string;
  network: 'bsc';
  timestamp: string;
  token: { symbol: string; contractAddress: string; isNative: boolean };
  from: string;
  to: string;
  amount: number;
  priceUsd: number | null;
}

/**
 * GET /api/ledger - every priced transfer leg with its from/to addresses, oldest first, for
 * mes.fm/taxes' combined adjusted-cost-base calculation (see ai/src/app/api/ledger/route.ts for why
 * that has to happen across all wallets at once rather than per app).
 */
export async function GET() {
  try {
    const priced = await getPricedTransactions();
    const entries: LedgerEntry[] = priced
      .filter((t) => t.amount !== 0)
      .map((t) => ({
        hash: t.hash,
        network: 'bsc' as const,
        timestamp: t.timestamp,
        token: t.token,
        from: t.from,
        to: t.to,
        amount: t.amount,
        priceUsd: t.priceUsd,
      }))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json({ data: { wallet: WALLET_ADDRESS, entries } } satisfies ApiResult<{ wallet: string; entries: LedgerEntry[] }>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load ledger');
  }
}
