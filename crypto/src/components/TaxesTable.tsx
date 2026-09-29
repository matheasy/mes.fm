'use client';

import { Fragment, useState } from 'react';
import LabelEditor from '@/components/LabelEditor';
import { money } from '@/components/TaxSummary';
import type { LabelRecord, TaxRow } from '@/lib/types';
import { WALLET_LINKS } from '@/lib/wallets';

/** Explorer link per network, as the source apps report them (sov's combined BTC spans chains, so it searches) */
function explorerTx(network: string, hash: string): string | null {
  switch (network) {
    case 'bsc':
      return `https://bscscan.com/tx/${hash}`;
    case 'ethereum':
      return `https://etherscan.io/tx/${hash}`;
    case 'arbitrum':
      return `https://arbiscan.io/tx/${hash}`;
    case 'hyperliquid':
      return hash.startsWith('0x') ? `https://app.hyperliquid.xyz/explorer/tx/${hash}` : null;
    case 'bitcoin':
      return `https://blockchair.com/search?q=${hash}`;
    case 'xrp':
      return `https://xrpscan.com/tx/${hash}`;
    case 'tgld':
      return `https://he.dtools.dev/tx/${hash}`;
    default:
      return null;
  }
}

const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });

interface TaxesTableProps {
  rows: TaxRow[];
  currency: 'USD' | 'CAD';
  onSaveLabel: (id: string, record: { tag: string; notes: string; screenshotUrls: string[] }) => Promise<void>;
}

export default function TaxesTable({ rows, currency, onSaveLabel }: TaxesTableProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const cad = currency === 'CAD';

  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Wallet</th>
            <th>Asset</th>
            <th>Quantity</th>
            <th>Proceeds</th>
            <th>ACB</th>
            <th>Gain / loss</th>
            <th>Label</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const proceeds = cad ? r.proceedsCad : r.proceedsUsd;
            const cost = cad ? r.costCad : r.costUsd;
            const gain = cad ? r.gainCad : r.gainUsd;
            const url = explorerTx(r.network, r.hash);
            const uncovered = r.uncoveredQuantity > 1e-9;

            return (
              <Fragment key={r.id}>
                <tr className={r.isTransfer ? 'opacity-60' : undefined}>
                  <td className="whitespace-nowrap">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                        {new Date(r.disposedAt).toLocaleDateString('en-CA')}
                      </a>
                    ) : (
                      new Date(r.disposedAt).toLocaleDateString('en-CA')
                    )}
                  </td>
                  <td>
                    <a href={WALLET_LINKS[r.wallet]} className="text-accent hover:underline">
                      {r.walletLabel}
                    </a>
                    <span className="block text-xs capitalize text-gray-500">{r.network}</span>
                  </td>
                  <td className="font-medium text-gray-100">
                    {r.symbol}
                    {r.asset !== r.symbol.toUpperCase() && <span className="block text-xs font-normal text-gray-500">pooled as {r.asset}</span>}
                  </td>
                  <td>{qty(r.quantity)}</td>
                  <td>{proceeds === null ? '—' : money(proceeds, currency)}</td>
                  <td>
                    {cost === null ? '—' : money(cost, currency)}
                    {uncovered && (
                      <span
                        className="block text-xs text-yellow-300"
                        title="The tracked history never shows these units arriving (bought before tracking, or on an exchange), so their cost is counted as 0. Add the real cost in a note."
                      >
                        cost unknown for {qty(r.uncoveredQuantity)}
                      </span>
                    )}
                  </td>
                  <td className={r.isTransfer ? 'text-gray-400' : (gain ?? 0) >= 0 ? 'text-gain' : 'text-loss'}>
                    {r.isTransfer ? 'transfer, not taxable' : gain === null ? '—' : money(gain, currency)}
                  </td>
                  <td>{r.label?.tag || <span className="text-gray-500">—</span>}</td>
                  <td>
                    <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)} className="text-xs text-accent hover:underline">
                      {r.label ? 'Edit' : 'Label'}
                    </button>
                  </td>
                </tr>
                {editing === r.id && (
                  <tr>
                    <td colSpan={9} className="!border-b-0 !p-0">
                      <div className="px-3 pb-3">
                        <LabelEditor
                          initial={r.label}
                          onCancel={() => setEditing(null)}
                          onSave={async (record: Omit<LabelRecord, 'updatedAt'>) => {
                            await onSaveLabel(r.id, record);
                            setEditing(null);
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
