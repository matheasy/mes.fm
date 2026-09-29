import { NextResponse } from 'next/server';
import { NETWORKS, type NetworkId } from '@/lib/config';
import { apiErrorResponse } from '@/lib/errors';
import { getPortfolioValueHistory, type PortfolioValuePoint } from '@/lib/ledger';
import type { ApiResult } from '@/lib/types';
import { withWallet } from '@/lib/walletContext';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return withWallet(request, async () => {
    try {
      const param = new URL(request.url).searchParams.get('network');
      const network = NETWORKS.includes(param as NetworkId) ? (param as NetworkId) : undefined;

      const history = await getPortfolioValueHistory(network);
      return NextResponse.json({ data: history } satisfies ApiResult<PortfolioValuePoint[]>);
    } catch (err) {
      return apiErrorResponse(err, 'Failed to load portfolio history');
    }
  });
}
