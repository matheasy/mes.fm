import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/apps/ai/lib/errors';
import { getAggregatedNetworkData } from '@/apps/ai/lib/ledger';
import type { PricedTransaction } from '@/apps/ai/lib/networks/types';
import type { ApiResult } from '@/apps/ai/lib/types';
import { currentWallet, withWallet } from '@/apps/ai/lib/walletContext';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export interface LedgerResponse {
  /** The wallet these entries belong to (lowercase) */
  wallet: string;
  /** Every non-zero transfer leg, oldest first, each with its USD price on that date (null = unpriced, e.g. scam airdrops) */
  entries: PricedTransaction[];
}

/**
 * GET /api/ledger?wallet=ai|main - the raw material for mes.fm/taxes' combined adjusted-cost-base
 * calculation: every priced transfer leg with its from/to addresses, unpaginated, on every
 * network. Unlike /api/gains this does no cost-basis accounting itself - the combined report has
 * to pool each coin across *all* wallets (the CRA's identical-property rule) and drop transfers
 * between the owner's own wallets, which no single-wallet app can do.
 */
export async function GET(request: Request) {
  return withWallet(request, async () => {
    try {
      // Everything, including the tokens this wallet's config excludes (the Main wallet's BTCB/WBTC, which
      // mes.fm/sov also reports): the tax report must see both sides of e.g. a BNB -> BTCB swap from one
      // source, and drops sov's copies of those same BTC legs itself (crypto/src/lib/tax/report.ts).
      const { byNetwork, networkErrors } = await getAggregatedNetworkData(undefined, { includeExcluded: true });
      const entries = Object.values(byNetwork)
        .flatMap((d) => d!.pricedTransactions)
        .filter((t) => t.amount !== 0)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      return NextResponse.json({
        data: { wallet: currentWallet().address, entries },
        networkErrors,
      } satisfies ApiResult<LedgerResponse>);
    } catch (err) {
      return apiErrorResponse(err, 'Failed to load ledger');
    }
  });
}
