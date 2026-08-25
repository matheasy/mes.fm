'use client';

import { useState } from 'react';
import NetworkErrorBanner from '@/components/NetworkErrorBanner';
import NetworkTabs, { type NetworkSelection } from '@/components/NetworkTabs';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import TransactionFilters from '@/components/TransactionFilters';
import TransactionsTable from '@/components/TransactionsTable';
import { useTransactions } from '@/hooks/useTransactions';
import type { NetworkId, TransactionFilters as Filters } from '@/lib/types';

export default function TransactionsPage() {
  const [network, setNetwork] = useState<NetworkSelection>('all');
  const selectedNetwork: NetworkId | undefined = network === 'all' ? undefined : network;
  const [filters, setFilters] = useState<Filters>({});
  const { transactions, networkErrors, isLoading, error, rateLimited, refresh } = useTransactions({ ...filters, network: selectedNetwork });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium text-gray-200">Transaction History</h2>
        <RefreshButton onRefreshed={refresh} disabledReason={rateLimited ? (error ?? 'Usage limit reached') : undefined} />
      </div>

      <NetworkTabs value={network} onChange={setNetwork} />
      <NetworkErrorBanner networkErrors={networkErrors} />

      <TransactionFilters filters={filters} onChange={setFilters} />

      <StateView
        loading={isLoading}
        error={rateLimited && transactions.length > 0 ? null : error}
        empty={transactions.length === 0}
        emptyMessage="No transactions match these filters."
        onRetry={refresh}
      >
        <TransactionsTable transactions={transactions} showNetwork={network === 'all'} />
      </StateView>
    </div>
  );
}
