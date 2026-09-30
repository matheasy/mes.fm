import { buildTaxReport } from '@/lib/tax/report';
import { TAX_GROUPS, type TaxGroup } from '@/lib/tax/taxSources';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const HEADERS = [
  'Date',
  'Wallet',
  'Network',
  'Asset (ACB pool)',
  'Token',
  'Quantity',
  'Proceeds (CAD)',
  'ACB (CAD)',
  'Gain/Loss (CAD)',
  'USD/CAD rate',
  'Proceeds (USD)',
  'ACB (USD)',
  'Gain/Loss (USD)',
  'Not a disposition (own transfer)',
  'Units with unknown cost',
  'Transaction',
  'Label',
  'Notes',
  'Screenshot Links',
];

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const fmt = (n: number | null) => (n === null ? '' : n.toFixed(2));

/** GET /api/taxes/export?year=2026&wallet=hive - the same rows as the Taxes page, as CSV */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletParam = searchParams.get('wallet');
  const group = TAX_GROUPS.includes(walletParam as TaxGroup) ? (walletParam as TaxGroup) : undefined;
  const yearParam = Number(searchParams.get('year'));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : undefined;

  let report;
  try {
    report = await buildTaxReport({ group, year });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'Failed to build the tax report', { status: 502 });
  }
  // an export is what gets filed: refuse a partial one (a wallet or network that didn't load) rather
  // than hand over totals with transactions silently missing. Only the SWAP.HIVE reconciliation note is
  // informational; a failed round-trip check changes the totals like a missing wallet does.
  const missing = report.sources.filter((s) => s.error && !s.key.startsWith('check:hive-engine:'));
  if (missing.length) {
    return new Response(
      `Not exported - some data didn't load, so the totals would be incomplete. Try again in a minute.\n\n${missing.map((s) => `${s.label}: ${s.error}`).join('\n')}`,
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const csvRows = [...report.rows]
    .sort((a, b) => new Date(a.disposedAt).getTime() - new Date(b.disposedAt).getTime())
    .map((r) =>
      [
        r.disposedAt.slice(0, 10),
        r.sourceLabel,
        r.network,
        r.asset,
        r.symbol,
        String(r.quantity),
        fmt(r.proceedsCad),
        fmt(r.costCad),
        fmt(r.gainCad),
        r.cadRate !== null ? r.cadRate.toFixed(4) : '',
        r.proceedsUsd.toFixed(2),
        r.costUsd.toFixed(2),
        r.gainUsd.toFixed(2),
        r.isTransfer ? 'yes' : '',
        r.uncoveredQuantity > 1e-9 ? String(r.uncoveredQuantity) : '',
        r.hash,
        r.label?.tag ?? '',
        r.label?.notes ?? '',
        (r.label?.screenshotUrls ?? []).join(' '),
      ]
        .map((v) => escapeCsvField(String(v)))
        .join(','),
    );

  const lines = [HEADERS.join(','), ...csvRows];
  // the owner's notes for the year go at the bottom, after an empty line
  const notes = report.yearNotes;
  if (notes && (notes.notes.trim() || notes.screenshotUrls.length)) {
    lines.push('', escapeCsvField(`Notes for ${report.year}`), escapeCsvField(notes.notes.trim()));
    if (notes.screenshotUrls.length) lines.push(escapeCsvField(notes.screenshotUrls.join(' ')));
  }
  const csv = lines.join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mes-crypto-taxes-${report.year}${group ? `-${group}` : ''}.csv"`,
    },
  });
}
