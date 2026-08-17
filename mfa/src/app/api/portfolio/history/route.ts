import { NextResponse } from 'next/server';
import { getPortfolioValueHistory, type PortfolioValuePoint } from '@/lib/ledger';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const history = await getPortfolioValueHistory();
    return NextResponse.json({ data: history } satisfies ApiResult<PortfolioValuePoint[]>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load portfolio history';
    return NextResponse.json({ error: message } satisfies ApiResult<PortfolioValuePoint[]>, { status: 502 });
  }
}
