import { buildTaxReport } from '@/lib/tax/report';
import { WALLET_KEYS, type WalletKey } from '@/lib/wallets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

/** GET /api/taxes/export?year=2026&wallet=main - the same rows as the Taxes page, as CSV */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletParam = searchParams.get('wallet');
  const wallet = WALLET_KEYS.includes(walletParam as WalletKey) ? (walletParam as WalletKey) : undefined;
  const yearParam = Number(searchParams.get('year'));
  const year = Number.isInteger(yearParam) && yearParam > 2000 ? yearParam : undefined;

  const report = await buildTaxReport({ wallet, year });
  if (!report) return new Response('No wallet could be loaded - try again in a minute', { status: 502 });

  const csvRows = [...report.rows]
    .sort((a, b) => new Date(a.disposedAt).getTime() - new Date(b.disposedAt).getTime())
    .map((r) =>
      [
        r.disposedAt.slice(0, 10),
        r.walletLabel,
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

  const csv = [HEADERS.join(','), ...csvRows].join('\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="mes-crypto-taxes-${report.year}${wallet ? `-${wallet}` : ''}.csv"`,
    },
  });
}
