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

export default function TransactionsTable({ transactions, showNetwork = false }: { transactions: Transaction[]; showNetwork?: boolean }) {
  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            {showNetwork && <th>Network</th>}
            <th>Type</th>
            <th>Token</th>
            <th>Amount</th>
            <th>Counterparty</th>
            <th>Gas</th>
            <th>Gas (USD)</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={`${t.network}-${t.hash}-${t.token.contractAddress}`}>
              <td>{new Date(t.timestamp).toLocaleDateString()}</td>
              {showNetwork && <td className="text-gray-400">{NETWORK_LABELS[t.network]}</td>}
              <td>{TYPE_LABELS[t.type]}</td>
              <td className="font-medium text-gray-100">{t.token.symbol}</td>
              <td className={t.amount >= 0 ? 'text-gain' : 'text-loss'}>
                {t.amount >= 0 ? '+' : ''}
                {t.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}
              </td>
              <td className="max-w-[10rem] truncate text-gray-400" title={t.amount >= 0 ? t.from : t.to}>
                {t.amount >= 0 ? t.from : t.to}
              </td>
              <td>{t.gasUsedNative > 0 ? `${t.gasUsedNative.toFixed(6)} ${NATIVE_TOKENS[t.network].symbol}` : '—'}</td>
              <td>{formatUsd(t.gasUsedUsd)}</td>
              <td>
                {t.hash.startsWith('hl-fill-') ? (
                  <span className="text-gray-500">—</span>
                ) : (
                  <a
                    href={EXPLORER_TX_URL[t.network](t.hash)}
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
