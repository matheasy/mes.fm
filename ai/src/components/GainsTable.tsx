import { NETWORK_LABELS } from '@/lib/config';
import type { GainResult } from '@/lib/accounting/types';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function GainsTable({ gains, showNetwork = false }: { gains: GainResult[]; showNetwork?: boolean }) {
  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Disposed</th>
            {showNetwork && <th>Network</th>}
            <th>Acquired</th>
            <th>Asset</th>
            <th>Quantity</th>
            <th>Proceeds</th>
            <th>Cost Basis</th>
            <th>Gain/Loss</th>
            <th>Term</th>
            <th>Tax Year</th>
          </tr>
        </thead>
        <tbody>
          {gains.map((g, i) => (
            <tr key={`${g.network}-${g.disposalTxHash}-${i}`}>
              <td>{new Date(g.disposedAt).toLocaleDateString()}</td>
              {showNetwork && <td className="text-gray-400">{NETWORK_LABELS[g.network]}</td>}
              <td>{new Date(g.acquiredAt).toLocaleDateString()}</td>
              <td className="font-medium text-gray-100">{g.tokenSymbol}</td>
              <td>{g.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
              <td>{formatUsd(g.proceedsUsd)}</td>
              <td>{formatUsd(g.costBasisUsd)}</td>
              <td className={g.gainUsd >= 0 ? 'text-gain' : 'text-loss'}>{formatUsd(g.gainUsd)}</td>
              <td className="capitalize">{g.term}</td>
              <td>{g.taxYear}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
