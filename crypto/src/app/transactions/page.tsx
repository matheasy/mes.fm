'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import TransactionFilters from '@/components/TransactionFilters';
import TransactionsTable from '@/components/TransactionsTable';
import { useTransactions } from '@/hooks/useTransactions';
import type { TransactionFilters as Filters } from '@/lib/types';
import { WALLET_KEYS, type WalletKey } from '@/lib/wallets';

function initialWallet(param: string | null): WalletKey | undefined {
  return WALLET_KEYS.includes(param as WalletKey) ? (param as WalletKey) : undefined;
}

function TransactionsPageInner() {
  const searchParams = useSearchParams();
  // Seeded once from ?wallet= (e.g. the "Transactions" link on mes.fm/sov, /ai, /mfa's own nav) -
  // after that the dropdown owns it, same as every other filter here.
  const [filters, setFilters] = useState<Filters>(() => ({ wallet: initialWallet(searchParams.get('wallet')) }));
  const { transactions, isLoading, error, rateLimited, refresh } = useTransactions(filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-gray-200">Combined Transaction History</h2>
        <RefreshButton onRefreshed={refresh} disabledReason={rateLimited ? (error ?? 'Usage limit reached') : undefined} />
      </div>

      <TransactionFilters filters={filters} onChange={setFilters} />

      <StateView
        loading={isLoading}
        error={rateLimited && transactions.length > 0 ? null : error}
        empty={transactions.length === 0}
        emptyMessage="No transactions match these filters."
        onRetry={refresh}
      >
        <TransactionsTable transactions={transactions} />
      </StateView>
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsPageInner />
    </Suspense>
  );
}
