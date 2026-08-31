import { NETWORK_LABELS } from '@/lib/config';
import type { Holding } from '@/lib/types';

function formatUsd(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function HoldingsTable({ holdings, showNetwork = false }: { holdings: Holding[]; showNetwork?: boolean }) {
  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Token</th>
            {showNetwork && <th>Network</th>}
            <th>Balance</th>
            <th>Price</th>
            <th>24h</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={`${h.token.network}-${h.token.contractAddress}`}>
              <td className="font-medium text-gray-100">
                {h.token.symbol}
                {h.category === 'perp-equity' && (
                  <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-accent">
                    Perps Equity
                  </span>
                )}
              </td>
              {showNetwork && <td className="text-gray-400">{NETWORK_LABELS[h.token.network]}</td>}
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
