'use client';

import { useState } from 'react';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import TransactionFilters from '@/components/TransactionFilters';
import TransactionsTable from '@/components/TransactionsTable';
import { useTransactions } from '@/hooks/useTransactions';
import type { TransactionFilters as Filters } from '@/lib/types';

export default function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>({});
  const { transactions, isLoading, error, refresh } = useTransactions(filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-200">Transaction History</h2>
        <RefreshButton onRefreshed={refresh} />
      </div>

      <TransactionFilters filters={filters} onChange={setFilters} />

      <StateView
        loading={isLoading}
        error={error}
        empty={transactions.length === 0}
        emptyMessage="No transactions match these filters."
        onRetry={refresh}
      >
        <TransactionsTable transactions={transactions} />
      </StateView>
    </div>
  );
}
