'use client';

import { useState } from 'react';
import CsvExportButton from '@/components/CsvExportButton';
import GainsSummary from '@/components/GainsSummary';
import GainsTable from '@/components/GainsTable';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import { useGains } from '@/hooks/useGains';
import type { CostBasisMethod } from '@/lib/accounting/types';

const METHODS: { value: CostBasisMethod; label: string }[] = [
  { value: 'fifo', label: 'FIFO' },
  { value: 'lifo', label: 'LIFO' },
  { value: 'average', label: 'Average Cost' },
];

export default function GainsPage() {
  const [method, setMethod] = useState<CostBasisMethod>('fifo');
  const { gains, isLoading, error, refresh } = useGains(method);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-medium text-gray-200">Capital Gains</h2>
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
        </div>
        <div className="flex gap-2">
          <CsvExportButton method={method} />
          <RefreshButton onRefreshed={refresh} />
        </div>
      </div>

      <StateView loading={isLoading} error={error} onRetry={refresh}>
        {gains && (
          <div className="flex flex-col gap-6">
            <GainsSummary realized={gains.realized} unrealized={gains.unrealized} />
            {gains.realized.length === 0 ? (
              <div className="panel py-12 text-center text-gray-400">No disposals yet — nothing realized to show.</div>
            ) : (
              <GainsTable gains={gains.realized} />
            )}
          </div>
        )}
      </StateView>
    </div>
  );
}
