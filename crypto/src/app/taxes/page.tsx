'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import CsvExportButton from '@/components/CsvExportButton';
import GainsSummary from '@/components/GainsSummary';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import TaxesTable from '@/components/TaxesTable';
import { useTaxes } from '@/hooks/useTaxes';
import { BASE_PATH } from '@/lib/basePath';
import type { CostBasisMethod } from '@/lib/accounting/types';
import { WALLET_KEYS, WALLET_LABELS, type WalletKey } from '@/lib/wallets';

const METHODS: { value: CostBasisMethod; label: string }[] = [
  { value: 'fifo', label: 'FIFO' },
  { value: 'lifo', label: 'LIFO' },
  { value: 'average', label: 'Average Cost' },
];

function initialWallet(param: string | null): WalletKey | undefined {
  return WALLET_KEYS.includes(param as WalletKey) ? (param as WalletKey) : undefined;
}

function TaxesPageInner() {
  const searchParams = useSearchParams();
  const [method, setMethod] = useState<CostBasisMethod>('fifo');
  const [wallet, setWallet] = useState<WalletKey | undefined>(() => initialWallet(searchParams.get('wallet')));
  const [showCad, setShowCad] = useState(false);
  const { taxes, isLoading, error, rateLimited, refresh } = useTaxes(method, wallet);

  async function saveLabel(id: string, record: { tag: string; notes: string; screenshotUrls: string[] }) {
    await fetch(`${BASE_PATH}/api/taxes/labels`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...record }),
    });
    refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">
        Combined capital-gains report across every group tracked by{' '}
        <a href="https://mes.fm/sov" className="text-accent hover:underline">
          mes.fm/sov
        </a>
        ,{' '}
        <a href="https://mes.fm/ai" className="text-accent hover:underline">
          mes.fm/ai
        </a>
        , and{' '}
        <a href="https://mes.fm/mfa" className="text-accent hover:underline">
          mes.fm/mfa
        </a>
        . USD amounts come straight from each group&apos;s own FIFO/LIFO/average calculation; CAD
        amounts convert each leg (cost basis and proceeds) at its own date&apos;s Bank of Canada
        rate, per CRA&apos;s own method — not one blended annual average. Click &quot;Label&quot;
        on a row to tag it, add notes, or attach screenshot links for your own records.
        Hive accounts (mes.fm/assets) aren&apos;t included yet — see the Taxes README.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as CostBasisMethod)}
            className="rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-sm text-gray-100"
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <div className="flex gap-1 rounded-md border border-bg-border p-0.5">
            <button
              type="button"
              onClick={() => setWallet(undefined)}
              className={`rounded px-2.5 py-1 text-sm ${!wallet ? 'bg-accent text-bg' : 'text-gray-300 hover:text-accent'}`}
            >
              All
            </button>
            {WALLET_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setWallet(k)}
                className={`rounded px-2.5 py-1 text-sm ${wallet === k ? 'bg-accent text-bg' : 'text-gray-300 hover:text-accent'}`}
              >
                {WALLET_LABELS[k]}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-sm text-gray-300">
            <input type="checkbox" checked={showCad} onChange={(e) => setShowCad(e.target.checked)} />
            Show CAD
          </label>
        </div>

        <div className="flex gap-2">
          <CsvExportButton method={method} wallet={wallet} />
          <RefreshButton onRefreshed={refresh} disabledReason={rateLimited ? (error ?? 'Usage limit reached') : undefined} />
        </div>
      </div>

      <StateView loading={isLoading} error={rateLimited && taxes ? null : error} onRetry={refresh}>
        {taxes && (
          <div className="flex flex-col gap-6">
            <GainsSummary realized={taxes.realized} unrealized={taxes.unrealized} />
            {taxes.realized.length === 0 ? (
              <div className="panel py-12 text-center text-gray-400">No disposals yet — nothing realized to show.</div>
            ) : (
              <TaxesTable rows={taxes.realized} showCad={showCad} onSaveLabel={saveLabel} />
            )}
          </div>
        )}
      </StateView>
    </div>
  );
}

export default function TaxesPage() {
  return (
    <Suspense fallback={null}>
      <TaxesPageInner />
    </Suspense>
  );
}
