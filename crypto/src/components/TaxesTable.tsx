'use client';

import { Fragment, useState } from 'react';
import LabelEditor from '@/components/LabelEditor';
import { WALLET_LINKS } from '@/lib/wallets';
import type { LabelRecord, TaxRow } from '@/lib/types';

function fmt(value: number, currency: 'USD' | 'CAD'): string {
  return value.toLocaleString('en-US', { style: 'currency', currency });
}

interface TaxesTableProps {
  rows: TaxRow[];
  showCad: boolean;
  onSaveLabel: (id: string, record: { tag: string; notes: string; screenshotUrls: string[] }) => Promise<void>;
}

export default function TaxesTable({ rows, showCad, onSaveLabel }: TaxesTableProps) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="panel overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Wallet</th>
            <th>Disposed</th>
            <th>Acquired</th>
            <th>Network</th>
            <th>Asset</th>
            <th>Quantity</th>
            <th>Proceeds</th>
            <th>Cost Basis</th>
            <th>Gain/Loss</th>
            <th>Term</th>
            <th>Tax Year</th>
            <th>Label</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const proceeds = showCad ? g.proceedsCad : g.proceedsUsd;
            const costBasis = showCad ? g.costBasisCad : g.costBasisUsd;
            const gain = showCad ? g.gainCad : g.gainUsd;
            const currency = showCad ? 'CAD' : 'USD';
            const cadUnavailable = showCad && (g.proceedsCad === null || g.costBasisCad === null);

            return (
              <Fragment key={g.id}>
                <tr>
                  <td>
                    <a href={WALLET_LINKS[g.wallet]} className="text-accent hover:underline">
                      {g.walletLabel}
                    </a>
                  </td>
                  <td>{new Date(g.disposedAt).toLocaleDateString()}</td>
                  <td>{new Date(g.acquiredAt).toLocaleDateString()}</td>
                  <td className="capitalize text-gray-400">{g.network}</td>
                  <td className="font-medium text-gray-100">{g.tokenSymbol}</td>
                  <td>{g.quantity.toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                  <td>{cadUnavailable ? '—' : fmt(proceeds ?? 0, currency)}</td>
                  <td>{cadUnavailable ? '—' : fmt(costBasis ?? 0, currency)}</td>
                  <td className={(gain ?? 0) >= 0 ? 'text-gain' : 'text-loss'}>{cadUnavailable ? '—' : fmt(gain ?? 0, currency)}</td>
                  <td className="capitalize">{g.term}</td>
                  <td>{g.taxYear}</td>
                  <td>{g.label?.tag || <span className="text-gray-500">—</span>}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => setEditing(editing === g.id ? null : g.id)}
                      className="text-xs text-accent hover:underline"
                    >
                      {g.label ? 'Edit' : 'Label'}
                    </button>
                  </td>
                </tr>
                {editing === g.id && (
                  <tr>
                    <td colSpan={13} className="!border-b-0 !p-0">
                      <div className="px-3 pb-3">
                        <LabelEditor
                          initial={g.label}
                          onCancel={() => setEditing(null)}
                          onSave={async (record: Omit<LabelRecord, 'updatedAt'>) => {
                            await onSaveLabel(g.id, record);
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
