import { EXPLORER_TX_URL, NATIVE_TOKENS, NETWORK_LABELS } from '@/lib/config';
import type { Transaction } from '@/lib/types';

function formatUsd(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const TYPE_LABELS: Record<Transaction['type'], string> = {
  send: 'Send',
  receive: 'Receive',
  swap: 'Swap',
  contract: 'Contract',
};

export default function TransactionsTable({
  transactions,
  showNetwork = false,
}: {
  transactions: Transaction[];
  showNetwork?: boolean;
}) {
  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {showNetwork && <th>Source</th>}
            <th>Type</th>
            <th>Asset</th>
            <th>Amount</th>
            <th>Counterparty</th>
            <th>Fee</th>
            <th>Fee (USD)</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t, i) => (
            <tr key={`${t.network}-${t.hash}-${t.token.contractAddress}-${i}`}>
              <td>{new Date(t.timestamp).toLocaleDateString()}</td>
              {showNetwork && <td className="text-gray-400">{NETWORK_LABELS[t.network]}</td>}
              <td>{TYPE_LABELS[t.type]}</td>
              <td className="font-medium text-gray-100">
                {t.token.symbol}
                {t.subLabel && <span className="ml-2 text-xs font-normal text-gray-500">{t.subLabel}</span>}
              </td>
              <td className={t.amount >= 0 ? 'text-gain' : 'text-loss'}>
                {t.amount >= 0 ? '+' : ''}
                {t.amount.toLocaleString('en-US', { maximumFractionDigits: 8 })}
              </td>
              <td className="max-w-[10rem] truncate text-gray-400" title={t.amount >= 0 ? t.from : t.to}>
                {t.amount >= 0 ? t.from : t.to}
              </td>
              <td>
                {t.gasUsedNative > 0 ? `${t.gasUsedNative.toFixed(6)} ${NATIVE_TOKENS[t.network].symbol}` : '—'}
              </td>
              <td>{formatUsd(t.gasUsedUsd)}</td>
              <td>
                {t.hash.includes('-') && !t.explorerUrl ? (
                  <span className="text-gray-500">—</span>
                ) : (
                  <a
                    href={t.explorerUrl ?? EXPLORER_TX_URL[t.network](t.hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    View
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
