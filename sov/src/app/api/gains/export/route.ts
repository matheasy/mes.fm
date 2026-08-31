import { computeRealizedGains } from '@/lib/accounting/engine';
import type { CostBasisMethod } from '@/lib/accounting/types';
import { NETWORKS, type NetworkId } from '@/lib/config';
import { buildLotsAndDisposalsByNetwork } from '@/lib/ledger';
import { buildGainsCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const methodParam = searchParams.get('method');
    const method = METHODS.includes(methodParam as CostBasisMethod) ? (methodParam as CostBasisMethod) : 'fifo';
    const networkParam = searchParams.get('network');
    const network = NETWORKS.includes(networkParam as NetworkId) ? (networkParam as NetworkId) : undefined;

    const { byNetwork } = await buildLotsAndDisposalsByNetwork(network);
    const realized = byNetwork.flatMap((nl) => computeRealizedGains(nl.lots, nl.disposals, method));
    const csv = buildGainsCsv(realized);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="sov-gains-${method}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export gains';
    return new Response(message, { status: 502 });
  }
}
