import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/errors';
import { getPortfolioValueHistory, type PortfolioValuePoint } from '@/lib/ledger';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const history = await getPortfolioValueHistory();
    return NextResponse.json({ data: history } satisfies ApiResult<PortfolioValuePoint[]>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load portfolio history');
  }
}
