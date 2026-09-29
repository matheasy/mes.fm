import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/apps/mfa/lib/errors';
import { getPortfolioValueHistory, type PortfolioValuePoint } from '@/apps/mfa/lib/ledger';
import type { ApiResult } from '@/apps/mfa/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
  try {
    const history = await getPortfolioValueHistory();
    return NextResponse.json({ data: history } satisfies ApiResult<PortfolioValuePoint[]>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load portfolio history');
  }
}
