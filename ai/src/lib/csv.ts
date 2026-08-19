import type { GainResult } from './accounting/types';

const HEADERS = ['Date', 'Asset', 'Proceeds (USD)', 'Cost Basis (USD)', 'Gain/Loss (USD)', 'Holding Period', 'Tax Year'];

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Builds a tax-reporting CSV (date, asset, proceeds, cost basis, gain/loss, holding period) from realized gains */
export function buildGainsCsv(gains: GainResult[]): string {
  const rows = gains
    .slice()
    .sort((a, b) => new Date(a.disposedAt).getTime() - new Date(b.disposedAt).getTime())
    .map((g) =>
      [
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

  return [HEADERS.join(','), ...rows].join('\n');
}
