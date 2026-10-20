import type { TaxesResponse } from '../types';

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

export function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const fmt = (n: number | null) => (n === null ? '' : n.toFixed(2));

/** The Taxes page's rows (plus the year's notes) as CSV - the export and the saved "as filed" copies */
export function reportToCsv(report: TaxesResponse): string {
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
  return lines.join('\n');
}
