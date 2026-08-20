import type { Holding } from '@/lib/types';

function formatUsd(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Balance</th>
            <th>Price</th>
            <th>24h</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.token.contractAddress}>
              <td className="font-medium text-gray-100">{h.token.symbol}</td>
              <td>{h.balanceFormatted.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
              <td>{formatUsd(h.priceUsd)}</td>
              <td className={h.change24hPct === null ? '' : h.change24hPct >= 0 ? 'text-gain' : 'text-loss'}>
                {h.change24hPct === null ? '—' : `${h.change24hPct >= 0 ? '+' : ''}${h.change24hPct.toFixed(2)}%`}
              </td>
              <td>{formatUsd(h.valueUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
