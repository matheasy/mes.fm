import { computeRealizedGains } from '@/lib/accounting/engine';
import type { CostBasisMethod } from '@/lib/accounting/types';
import { buildLotsAndDisposals } from '@/lib/ledger';
import { buildGainsCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const methodParam = searchParams.get('method');
    const method = METHODS.includes(methodParam as CostBasisMethod) ? (methodParam as CostBasisMethod) : 'fifo';

    const { lots, disposals } = await buildLotsAndDisposals();
    const realized = computeRealizedGains(lots, disposals, method);
    const csv = buildGainsCsv(realized);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="mfa-gains-${method}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to export gains';
    return new Response(message, { status: 502 });
  }
}
