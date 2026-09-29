import { NextResponse } from 'next/server';
import { buildTaxReport } from '@/lib/tax/report';
import type { ApiResult, TaxesResponse } from '@/lib/types';
import { WALLET_KEYS, type WalletKey } from '@/lib/wallets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/taxes?year=2026&wallet=main
 *
 * mes.fm/taxes' data: every wallet's full history pooled into one Canadian ACB calculation
 * (lib/tax/acb.ts), in CAD at each day's Bank of Canada rate. `year` picks which tax year's
 * dispositions to list (default: the latest year that has any); `wallet` only narrows which
 * rows are listed - the calculation itself always runs across every wallet, since that's the
 * CRA's rule (one pool per asset, whatever wallet holds it).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletParam = searchParams.get('wallet');
  const wallet = WALLET_KEYS.includes(walletParam as WalletKey) ? (walletParam as WalletKey) : undefined;
  const yearParam = Number(searchParams.get('year'));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : undefined;

  const report = await buildTaxReport({ wallet, year });
  if (!report) {
    return NextResponse.json({ error: 'No wallet could be loaded - try again in a minute' } satisfies ApiResult<TaxesResponse>, {
      status: 502,
    });
  }
  return NextResponse.json({ data: report } satisfies ApiResult<TaxesResponse>);
}
