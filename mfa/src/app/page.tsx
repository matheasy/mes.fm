'use client';

import Link from 'next/link';
import AllocationChart from '@/components/AllocationChart';
import HoldingsTable from '@/components/HoldingsTable';
import PortfolioSummary from '@/components/PortfolioSummary';
import PortfolioValueChart from '@/components/PortfolioValueChart';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import TransactionsTable from '@/components/TransactionsTable';
import { usePortfolio } from '@/hooks/usePortfolio';
import { usePortfolioHistory } from '@/hooks/usePortfolioHistory';
import { useTransactions } from '@/hooks/useTransactions';

const RECENT_TRANSACTIONS_LIMIT = 5;

export default function OverviewPage() {
  const { portfolio, isLoading, error, refresh } = usePortfolio();
  const { history, isLoading: historyLoading, error: historyError, refresh: refreshHistory } = usePortfolioHistory();
  const { transactions, isLoading: txLoading, error: txError, refresh: refreshTx } = useTransactions({});

  function refreshAll() {
    refresh();
    refreshHistory();
    refreshTx();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <RefreshButton onRefreshed={refreshAll} />
      </div>

      <StateView loading={isLoading} error={error} onRetry={refresh}>
        {portfolio && (
          <div className="flex flex-col gap-6">
            <PortfolioSummary summary={portfolio} />
            <StateView loading={historyLoading} error={historyError} onRetry={refreshHistory}>
              <PortfolioValueChart history={history} />
            </StateView>
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <HoldingsTable holdings={portfolio.holdings} />
              <AllocationChart holdings={portfolio.holdings} />
            </div>
          </div>
        )}
      </StateView>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-200">Recent Transactions</h2>
          <Link href="/transactions" className="text-sm text-accent hover:underline">
            View all
          </Link>
        </div>
        <StateView
          loading={txLoading}
          error={txError}
          empty={transactions.length === 0}
          emptyMessage="No transactions yet."
          onRetry={refreshTx}
        >
          <TransactionsTable transactions={transactions.slice(0, RECENT_TRANSACTIONS_LIMIT)} />
        </StateView>
      </div>
    </div>
  );
}
