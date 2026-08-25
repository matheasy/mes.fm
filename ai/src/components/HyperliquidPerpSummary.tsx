import type { HyperliquidPerpSummary as Summary } from '@/lib/networks/types';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function HyperliquidPerpSummary({ summary }: { summary: Summary }) {
  const cards = [
    { label: 'Account Equity', value: summary.accountEquityUsd },
    { label: 'Realized P&L', value: summary.realizedPnlUsd },
    { label: 'Unrealized P&L', value: summary.unrealizedPnlUsd },
  ];

  return (
    <div className="panel flex flex-col gap-4 border-accent/30">
      <div>
        <p className="text-sm font-medium text-gray-200">Hyperliquid Perpetuals P&amp;L</p>
        <p className="mt-1 text-xs text-gray-500">
          Informational only, not tax advice. Mark-to-market position P&amp;L reported directly by Hyperliquid — kept
          separate from the FIFO/LIFO/average capital-gains summary above, which covers spot and EVM holdings only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label}>
            <p className="stat-label">{c.label}</p>
            <p className={`mt-1 text-lg font-semibold ${c.value >= 0 ? 'text-gain' : 'text-loss'}`}>{formatUsd(c.value)}</p>
          </div>
        ))}
      </div>

      {summary.positions.length > 0 && (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Position</th>
                <th>Size</th>
                <th>Entry Price</th>
                <th>Position Value</th>
                <th>Unrealized P&amp;L</th>
                <th>Liq. Price</th>
              </tr>
            </thead>
            <tbody>
              {summary.positions.map((p) => (
                <tr key={p.coin}>
                  <td className="font-medium text-gray-100">{p.coin}</td>
                  <td className={p.sizeUnits >= 0 ? 'text-gain' : 'text-loss'}>{p.sizeUnits.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                  <td>{formatUsd(p.entryPriceUsd)}</td>
                  <td>{formatUsd(p.positionValueUsd)}</td>
                  <td className={p.unrealizedPnlUsd >= 0 ? 'text-gain' : 'text-loss'}>{formatUsd(p.unrealizedPnlUsd)}</td>
                  <td>{p.liquidationPriceUsd !== null ? formatUsd(p.liquidationPriceUsd) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.recentFills.length > 0 && (
        <div className="overflow-x-auto">
          <p className="stat-label mb-2">Recent Perp Fills</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Coin</th>
                <th>Side</th>
                <th>Size</th>
                <th>Price</th>
                <th>Closed P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentFills.map((f, i) => (
                <tr key={`${f.coin}-${f.time}-${i}`}>
                  <td>{new Date(f.time).toLocaleDateString()}</td>
                  <td className="font-medium text-gray-100">{f.coin}</td>
                  <td className="capitalize">{f.side}</td>
                  <td>{f.sizeUnits.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                  <td>{formatUsd(f.priceUsd)}</td>
                  <td className={f.closedPnlUsd >= 0 ? 'text-gain' : 'text-loss'}>{formatUsd(f.closedPnlUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
