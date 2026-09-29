'use client';

import { Fragment, useState } from 'react';
import LabelEditor from '@/components/LabelEditor';
import { money } from '@/components/TaxSummary';
import type { LabelRecord, TaxRow } from '@/lib/types';

/** Explorer link per network, as the sources report them (sov's combined BTC spans chains, so it searches) */
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
    case 'bitcoin-l1':
      return `https://mempool.space/tx/${hash}`;
    case 'xrp':
      return `https://xrpscan.com/tx/${hash}`;
    case 'tgld':
      return `https://he.dtools.dev/tx/${hash}`;
    case 'hive': {
      const trx = hash.split(':')[0]!;
      return /^[0-9a-f]{40}$/.test(trx) ? `https://hivehub.dev/tx/${trx}` : null;
    }
    default:
      return null;
  }
}

const KIND_LABELS: Record<TaxRow['kind'], string> = { swap: 'Swap', send: 'Sent', lp: 'Into LP', bridge: 'To Hive Engine' };

const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });
const short = (s: string) => (s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);

interface TaxesTableProps {
  rows: TaxRow[];
  currency: 'USD' | 'CAD';
  onSaveLabel: (id: string, record: Omit<LabelRecord, 'updatedAt'>) => Promise<void>;
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
            <th>Source</th>
            <th>Asset</th>
            <th>Quantity</th>
            <th>What</th>
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
            const unknownCost = r.needsInput.includes('unknown-cost');
            const reviewSend = r.needsInput.includes('send');

            return (
              <Fragment key={r.id}>
                <tr className={r.isTransfer ? 'opacity-60' : r.needsInput.length ? 'bg-yellow-500/[0.06]' : undefined}>
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
                    <a href={r.sourceLink} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      {r.sourceLabel}
                    </a>
                    <span className="block text-xs capitalize text-gray-500">{r.network === 'bitcoin-l1' ? 'bitcoin' : r.network}</span>
                  </td>
                  <td className="font-medium text-gray-100">
                    {r.symbol}
                    {r.asset !== r.symbol.toUpperCase() && <span className="block text-xs font-normal text-gray-500">pooled as {r.asset}</span>}
                  </td>
                  <td>{qty(r.quantity)}</td>
                  <td className="text-xs">
                    <span className="text-gray-300">{KIND_LABELS[r.kind]}</span>
                    <span className="block text-gray-500" title={r.counterparty}>
                      to {short(r.counterparty)}
                    </span>
                  </td>
                  <td>{proceeds === null ? '—' : money(proceeds, currency)}</td>
                  <td>
                    {cost === null ? '—' : money(cost, currency)}
                    {r.costOverridden && <span className="block text-xs text-gray-500">incl. your cost</span>}
                  </td>
                  <td className={r.isTransfer ? 'text-gray-400' : (gain ?? 0) >= 0 ? 'text-gain' : 'text-loss'}>
                    {r.isTransfer ? 'transfer, not taxable' : gain === null ? '—' : money(gain, currency)}
                  </td>
                  <td>
                    {r.label?.tag || <span className="text-gray-500">—</span>}
                    {reviewSend && (
                      <span className="block text-xs text-yellow-300" title="Nothing came back in this transaction. Was it a payment, a gift, or a deposit to your own exchange account? Label it - Personal transfer stops it counting as a sale.">
                        needs a label
                      </span>
                    )}
                    {unknownCost && (
                      <span
                        className="block text-xs text-yellow-300"
                        title="The history never shows these units arriving (bought before tracking, on an exchange, or held at the Hive fork), so their cost is $0. Enter what they cost you, if you know."
                      >
                        cost unknown for {qty(r.uncoveredQuantity)}
                      </span>
                    )}
                  </td>
                  <td>
                    <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)} className="text-xs text-accent hover:underline">
                      {r.label ? 'Edit' : 'Label'}
                    </button>
                  </td>
                </tr>
                {editing === r.id && (
                  <tr>
                    <td colSpan={10} className="!border-b-0 !p-0">
                      <div className="px-3 pb-3">
                        <LabelEditor
                          initial={r.label}
                          uncoveredQuantity={r.uncoveredQuantity > 1e-9 ? r.uncoveredQuantity : 0}
                          symbol={r.symbol}
                          onCancel={() => setEditing(null)}
                          onSave={async (record) => {
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
