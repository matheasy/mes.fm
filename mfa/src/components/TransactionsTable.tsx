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

export default function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Token</th>
            <th>Amount</th>
            <th>Counterparty</th>
            <th>Gas (BNB)</th>
            <th>Gas (USD)</th>
            <th>Tx</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={`${t.hash}-${t.token.contractAddress}`}>
              <td>{new Date(t.timestamp).toLocaleDateString()}</td>
              <td>{TYPE_LABELS[t.type]}</td>
              <td className="font-medium text-gray-100">{t.token.symbol}</td>
              <td className={t.amount >= 0 ? 'text-gain' : 'text-loss'}>
                {t.amount >= 0 ? '+' : ''}
                {t.amount.toLocaleString('en-US', { maximumFractionDigits: 6 })}
              </td>
              <td className="max-w-[10rem] truncate text-gray-400" title={t.amount >= 0 ? t.from : t.to}>
                {t.amount >= 0 ? t.from : t.to}
              </td>
              <td>{t.gasUsedBnb > 0 ? t.gasUsedBnb.toFixed(6) : '—'}</td>
              <td>{formatUsd(t.gasUsedUsd)}</td>
              <td>
                <a
                  href={`https://bscscan.com/tx/${t.hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  View
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
