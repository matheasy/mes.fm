'use client';

import AssetsTotalCard from '@/components/AssetsTotalCard';
import PortfolioSummary from '@/components/PortfolioSummary';
import { useSWRConfig } from 'swr';
import FreshNote from '@/components/FreshNote';
import SyncStatus from '@/components/SyncStatus';
import LpCard from '@/components/LpCard';
import SovCard from '@/components/SovCard';
import StateView from '@/components/StateView';
import WalletBreakdown from '@/components/WalletBreakdown';
import { usePortfolio } from '@/hooks/usePortfolio';

export default function OverviewPage() {
  const { portfolio, isLoading, error, savedAt, updating } = usePortfolio();
  const { mutate } = useSWRConfig();
  // fresh prices for every card on the page: current prices are cached for only 2 minutes server-side,
  // so re-asking the live endpoints is enough (the old Refresh also wiped every wallet's history cache)
  const refreshPrices = () => mutate((key) => typeof key === 'string' && key.includes('/api/') && !key.includes('stored=1'));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">
        Your wallets by group - the Main wallet,{' '}
        <a href="https://mes.fm/ai" className="text-accent hover:underline">
          AI Trading
        </a>
        ,{' '}
        <a href="https://mes.fm/mfa" className="text-accent hover:underline">
          MikeFA Trading
        </a>
        ,{' '}
        <a href="https://mes.fm/sov" className="text-accent hover:underline">
          Store of Value
        </a>{' '}
        and{' '}
        <a href="https://mes.fm/lp" className="text-accent hover:underline">
          Liquidity
        </a>{' '}
        - and, below them, everything held anywhere from{' '}
        <a href="https://mes.fm/assets" className="text-accent hover:underline">
          mes.fm/assets
        </a>
        . Every transfer from these wallets is on{' '}
        <a href="https://mes.fm/portfolio/transactions" className="text-accent hover:underline">
          Transactions
        </a>
        , and your Canadian capital gains (ACB, in CAD) on{' '}
        <a href="https://mes.fm/taxes" className="text-accent hover:underline">
          mes.fm/taxes
        </a>
        .
      </p>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <SyncStatus />
        <button
          type="button"
          onClick={() => refreshPrices()}
          disabled={updating}
          className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {updating ? 'Updating prices…' : 'Refresh prices'}
        </button>
      </div>

      <FreshNote savedAt={savedAt} updating={updating} error={error} />
      <StateView loading={isLoading} error={portfolio ? null : error} onRetry={refreshPrices}>
        {portfolio && (
          <div className="flex flex-col gap-6">
            <PortfolioSummary summary={portfolio} />
            <WalletBreakdown wallets={portfolio.wallets} />
          </div>
        )}
      </StateView>

      <div className="grid gap-4 sm:grid-cols-2">
        <SovCard />
        <LpCard />
      </div>

      <AssetsTotalCard />
    </div>
  );
}
