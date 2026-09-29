import { NextResponse } from 'next/server';
import { ADDRESSES } from '@/lib/config';
import { apiErrorResponse } from '@/lib/errors';
import { getAggregatedNetworkData } from '@/lib/ledger';
import type { PricedTransaction } from '@/lib/sources/types';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/ledger - every priced leg from this app's three sources (combined BTC = BTCB/WBTC on
 * the Main wallet, XRP, TGLD), oldest first, for mes.fm/taxes' combined adjusted-cost-base
 * calculation (see ai/src/app/api/ledger/route.ts). `wallet` is the Main wallet's EVM address, the
 * owner of the BTC legs; the XRP / TGLD legs carry their own from/to (XRP address, Hive account).
 */
export async function GET() {
  try {
    const { byNetwork, networkErrors } = await getAggregatedNetworkData();
    const entries: PricedTransaction[] = Object.values(byNetwork)
      .flatMap((d) => d!.pricedTransactions)
      .filter((t) => t.amount !== 0)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json({
      data: { wallet: ADDRESSES.bitcoin, entries },
      networkErrors,
    } satisfies ApiResult<{ wallet: string; entries: PricedTransaction[] }>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load ledger');
  }
}
