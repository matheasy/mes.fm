'use client';

import { useState } from 'react';
import AllocationChart from '@/apps/ai/components/AllocationChart';
import HoldingsTable from '@/apps/ai/components/HoldingsTable';
import NetworkErrorBanner from '@/apps/ai/components/NetworkErrorBanner';
import NetworkTabs, { type NetworkSelection } from '@/apps/ai/components/NetworkTabs';
import PortfolioSummary from '@/apps/ai/components/PortfolioSummary';
import PortfolioValueChart from '@/apps/ai/components/PortfolioValueChart';
import RefreshButton from '@/apps/ai/components/RefreshButton';
import StateView from '@/apps/ai/components/StateView';
import TransactionsTable from '@/apps/ai/components/TransactionsTable';
import { usePortfolio } from '@/apps/ai/hooks/usePortfolio';
import { usePortfolioHistory } from '@/apps/ai/hooks/usePortfolioHistory';
import { useTransactions } from '@/apps/ai/hooks/useTransactions';
import type { NetworkId } from '@/apps/ai/lib/types';

const RECENT_TRANSACTIONS_LIMIT = 5;

export default function OverviewPage() {
  const [network, setNetwork] = useState<NetworkSelection>('all');
  const selectedNetwork: NetworkId | undefined = network === 'all' ? undefined : network;

  const { portfolio, networkErrors, isLoading, error, rateLimited, refresh } = usePortfolio(selectedNetwork);
  const {
    history,
    isLoading: historyLoading,
    error: historyError,
    rateLimited: historyRateLimited,
    refresh: refreshHistory,
  } = usePortfolioHistory(selectedNetwork);
  const {
    transactions,
    isLoading: txLoading,
    error: txError,
    rateLimited: txRateLimited,
    refresh: refreshTx,
  } = useTransactions({ network: selectedNetwork });

  function refreshAll() {
    refresh();
    refreshHistory();
    refreshTx();
  }

  const anyRateLimited = rateLimited || historyRateLimited || txRateLimited;
  const disabledReason = anyRateLimited ? (error ?? historyError ?? txError ?? 'Usage limit reached') : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NetworkTabs value={network} onChange={setNetwork} />
        <RefreshButton onRefreshed={refreshAll} disabledReason={disabledReason} />
      </div>

      <NetworkErrorBanner networkErrors={networkErrors} />

      <StateView loading={isLoading} error={rateLimited && portfolio ? null : error} onRetry={refresh}>
        {portfolio && (
          <div className="flex flex-col gap-6">
            <PortfolioSummary summary={portfolio} />
            <StateView loading={historyLoading} error={historyRateLimited && history.length > 0 ? null : historyError} onRetry={refreshHistory}>
              <PortfolioValueChart history={history} />
            </StateView>
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <HoldingsTable holdings={portfolio.holdings} showNetwork={network === 'all'} />
              <AllocationChart holdings={portfolio.holdings} />
            </div>
          </div>
        )}
      </StateView>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-gray-200">Recent Transactions</h2>
          <a href="https://mes.fm/portfolio/transactions?wallet=ai" className="text-sm text-accent hover:underline">
            View all
          </a>
        </div>
        <StateView
          loading={txLoading}
          error={txRateLimited && transactions.length > 0 ? null : txError}
          empty={transactions.length === 0}
          emptyMessage="No transactions yet."
          onRetry={refreshTx}
        >
          <TransactionsTable transactions={transactions.slice(0, RECENT_TRANSACTIONS_LIMIT)} showNetwork={network === 'all'} />
        </StateView>
      </div>
    </div>
  );
}
