import { NextResponse } from 'next/server';
import { NETWORKS, type NetworkId } from '@/lib/config';
import { apiErrorResponse } from '@/lib/errors';
import { getPortfolioValueHistory, type PortfolioValuePoint } from '@/lib/ledger';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const param = new URL(request.url).searchParams.get('network');
    const network = NETWORKS.includes(param as NetworkId) ? (param as NetworkId) : undefined;

    const history = await getPortfolioValueHistory(network);
    return NextResponse.json({ data: history } satisfies ApiResult<PortfolioValuePoint[]>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load portfolio history');
  }
}
