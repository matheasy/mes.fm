'use client';

import type { TransactionFilters as Filters, TransactionType } from '@/lib/types';
import { WALLET_KEYS, WALLET_LABELS } from '@/lib/wallets';

const TYPES: TransactionType[] = ['send', 'receive', 'swap', 'contract'];

export default function TransactionFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  return (
    <div className="panel flex flex-wrap items-end gap-4">
      <label className="flex flex-col text-xs text-gray-400">
        Wallet
        <select
          value={filters.wallet ?? ''}
          onChange={(e) => onChange({ ...filters, wallet: (e.target.value || undefined) as Filters['wallet'] })}
          className="mt-1 rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-sm text-gray-100"
        >
          <option value="">All</option>
          {WALLET_KEYS.map((k) => (
            <option key={k} value={k}>
              {WALLET_LABELS[k]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs text-gray-400">
        Token
        <input
          type="text"
          value={filters.token ?? ''}
          onChange={(e) => onChange({ ...filters, token: e.target.value || undefined })}
          placeholder="e.g. BNB"
          className="mt-1 rounded-md border border-bg-border bg-transparent px-2 py-1 text-sm text-gray-100"
        />
      </label>

      <label className="flex flex-col text-xs text-gray-400">
        Type
        <select
          value={filters.type ?? ''}
          onChange={(e) => onChange({ ...filters, type: (e.target.value || undefined) as TransactionType | undefined })}
          className="mt-1 rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-sm text-gray-100"
        >
          <option value="">All</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col text-xs text-gray-400">
        From
        <input
          type="date"
          value={filters.startDate?.slice(0, 10) ?? ''}
          onChange={(e) => onChange({ ...filters, startDate: e.target.value || undefined })}
          className="mt-1 rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-sm text-gray-100"
        />
      </label>

      <label className="flex flex-col text-xs text-gray-400">
        To
        <input
          type="date"
          value={filters.endDate?.slice(0, 10) ?? ''}
          onChange={(e) => onChange({ ...filters, endDate: e.target.value || undefined })}
          className="mt-1 rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-sm text-gray-100"
        />
      </label>

      <button
        onClick={() => onChange({})}
        className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-300 hover:border-accent hover:text-accent"
      >
        Clear
      </button>
    </div>
  );
}
