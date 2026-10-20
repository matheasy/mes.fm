import type { SourcedTransaction } from '@/lib/types';
import { WALLET_LABELS, WALLET_LINKS } from '@/lib/wallets';

function formatUsd(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const TYPE_LABELS: Record<SourcedTransaction['type'], string> = {
  send: 'Send',
  receive: 'Receive',
  swap: 'Swap',
  contract: 'Contract',
};

const EXPLORERS: Record<string, string> = {
  bsc: 'https://bscscan.com/tx/',
  ethereum: 'https://etherscan.io/tx/',
  arbitrum: 'https://arbiscan.io/tx/',
  polygon: 'https://polygonscan.com/tx/',
  hyperliquid: 'https://app.hyperliquid.xyz/explorer/tx/',
};

/** The block explorer of the row's own network (rows used to all link BscScan, even Ethereum ones) */
function txUrl(network: string | undefined, hash: string): string {
  return `${EXPLORERS[network ?? 'bsc'] ?? EXPLORERS.bsc}${hash}`;
}

export default function TransactionsTable({ transactions }: { transactions: SourcedTransaction[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Wallet</th>
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
          {transactions.map((t, i) => (
            <tr key={`${t.wallet}-${t.hash}-${t.token.contractAddress}-${i}`}>
              <td>
                <a href={WALLET_LINKS[t.wallet]} className="text-accent hover:underline">
                  {WALLET_LABELS[t.wallet]}
                </a>
              </td>
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
                {/* Store-of-Value rows span BTC/XRP/Hive-Engine, not one EVM explorer — skip the link there */}
                {t.wallet === 'sov' ? (
                  <span className="text-gray-500">—</span>
                ) : (
                  <a
                    href={txUrl(t.network, t.hash)}
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
