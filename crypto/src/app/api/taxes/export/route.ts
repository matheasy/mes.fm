import { reportToCsv } from '@/lib/tax/csv';
import { buildTaxReport } from '@/lib/tax/report';
import { TAX_GROUPS, type TaxGroup } from '@/lib/tax/taxSources';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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
  // than hand over totals with transactions silently missing: a source never stored, or a failed
  // round-trip check (it changes the totals). Notes about the stored copy (last update failed, rows
  // held for review) and the SWAP.HIVE reconciliation are informational - the stored rows are complete.
  const missing = report.sources.filter((s) => s.error && (!s.key.startsWith('check:') || s.key.startsWith('check:contracts:')));
  if (missing.length) {
    return new Response(
      `Not exported - some data didn't load, so the totals would be incomplete. Try again in a minute.\n\n${missing.map((s) => `${s.label}: ${s.error}`).join('\n')}`,
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const csv = reportToCsv(report);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mes-crypto-taxes-${report.year}${group ? `-${group}` : ''}.csv"`,
    },
  });
}
