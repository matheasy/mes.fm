import { fetchAllSources } from '@/lib/combine';
import type { CostBasisMethod, GainResult } from '@/lib/accounting/types';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];
const HEADERS = ['Wallet', 'Date', 'Asset', 'Proceeds (USD)', 'Cost Basis (USD)', 'Gain/Loss (USD)', 'Holding Period', 'Tax Year'];

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const methodParam = searchParams.get('method');
  const method = METHODS.includes(methodParam as CostBasisMethod) ? (methodParam as CostBasisMethod) : 'fifo';

  const results = await fetchAllSources<{ realized: GainResult[] }>(`/api/gains?method=${method}`);

  const rows = results
    .flatMap((r) => (r.data?.realized ?? []).map((g) => ({ ...g, walletLabel: r.source.label })))
    .sort((a, b) => new Date(a.disposedAt).getTime() - new Date(b.disposedAt).getTime())
    .map((g) =>
      [
        g.walletLabel,
        g.disposedAt.slice(0, 10),
        g.tokenSymbol,
        g.proceedsUsd.toFixed(2),
        g.costBasisUsd.toFixed(2),
        g.gainUsd.toFixed(2),
        g.term === 'long' ? 'Long-term' : 'Short-term',
        String(g.taxYear),
      ]
        .map(escapeCsvField)
        .join(','),
    );

  const csv = [HEADERS.join(','), ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mes-crypto-gains-${method}.csv"`,
    },
  });
}
