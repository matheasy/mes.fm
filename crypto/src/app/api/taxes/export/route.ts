import { getCadRates } from '@/lib/cadRate';
import { fetchAllSources } from '@/lib/combine';
import { listLabels } from '@/lib/labels';
import type { CostBasisMethod, GainResult } from '@/lib/accounting/types';
import { gainRowId, type SourcedGainResult } from '@/lib/types';
import { WALLET_KEYS, type WalletKey } from '@/lib/wallets';

export const dynamic = 'force-dynamic';

const METHODS: CostBasisMethod[] = ['fifo', 'lifo', 'average'];
const HEADERS = [
  'Wallet',
  'Date',
  'Network',
  'Asset',
  'Proceeds (USD)',
  'Cost Basis (USD)',
  'Gain/Loss (USD)',
  'USD/CAD Rate (Acquired)',
  'USD/CAD Rate (Disposed)',
  'Proceeds (CAD)',
  'Cost Basis (CAD)',
  'Gain/Loss (CAD)',
  'Holding Period',
  'Tax Year',
  'Label',
  'Notes',
  'Screenshot Links',
];

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const fmt = (n: number | null) => (n === null ? '' : n.toFixed(2));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const methodParam = searchParams.get('method');
  const method = METHODS.includes(methodParam as CostBasisMethod) ? (methodParam as CostBasisMethod) : 'fifo';
  const walletParam = searchParams.get('wallet');
  const walletFilter = WALLET_KEYS.includes(walletParam as WalletKey) ? (walletParam as WalletKey) : undefined;

  const results = await fetchAllSources<{ realized: GainResult[] }>(`/api/gains?method=${method}`);
  let rows: SourcedGainResult[] = results.flatMap((r) => (r.data?.realized ?? []).map((g) => ({ ...g, wallet: r.source.key })));
  if (walletFilter) rows = rows.filter((g) => g.wallet === walletFilter);
  rows.sort((a, b) => new Date(a.disposedAt).getTime() - new Date(b.disposedAt).getTime());

  const walletLabelOf = new Map(results.map((r) => [r.source.key, r.source.label]));
  const allDates = rows.flatMap((g) => [g.acquiredAt, g.disposedAt]);
  const [rates, labels] = await Promise.all([getCadRates(allDates), listLabels()]);

  const csvRows = rows.map((g) => {
    const id = gainRowId(g);
    const label = labels[id];
    const rAcq = rates.get(g.acquiredAt.slice(0, 10)) ?? null;
    const rDisp = rates.get(g.disposedAt.slice(0, 10)) ?? null;
    const proceedsCad = rDisp !== null ? g.proceedsUsd * rDisp : null;
    const costBasisCad = rAcq !== null ? g.costBasisUsd * rAcq : null;
    const gainCad = proceedsCad !== null && costBasisCad !== null ? proceedsCad - costBasisCad : null;

    return [
      walletLabelOf.get(g.wallet) ?? g.wallet,
      g.disposedAt.slice(0, 10),
      g.network,
      g.tokenSymbol,
      g.proceedsUsd.toFixed(2),
      g.costBasisUsd.toFixed(2),
      g.gainUsd.toFixed(2),
      rAcq !== null ? rAcq.toFixed(4) : '',
      rDisp !== null ? rDisp.toFixed(4) : '',
      fmt(proceedsCad),
      fmt(costBasisCad),
      fmt(gainCad),
      g.term === 'long' ? 'Long-term' : 'Short-term',
      String(g.taxYear),
      label?.tag ?? '',
      label?.notes ?? '',
      (label?.screenshotUrls ?? []).join(' '),
    ]
      .map((v) => escapeCsvField(String(v)))
      .join(',');
  });

  const csv = [HEADERS.join(','), ...csvRows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mes-taxes-${method}.csv"`,
    },
  });
}
