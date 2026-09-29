import { NextResponse } from 'next/server';
import { buildTaxReport } from '@/lib/tax/report';
import type { ApiResult, TaxesResponse } from '@/lib/types';
import { TAX_GROUPS, type TaxGroup } from '@/lib/tax/taxSources';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * GET /api/taxes?year=2026&wallet=hive
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
  const group = TAX_GROUPS.includes(walletParam as TaxGroup) ? (walletParam as TaxGroup) : undefined;
  const yearParam = Number(searchParams.get('year'));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : undefined;

  try {
    const report = await buildTaxReport({ group, year });
    return NextResponse.json({ data: report } satisfies ApiResult<TaxesResponse>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to build the tax report';
    return NextResponse.json({ error: message } satisfies ApiResult<TaxesResponse>, { status: 502 });
  }
}
