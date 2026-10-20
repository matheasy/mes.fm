'use client';

import AssetsTotalCard from '@/components/AssetsTotalCard';
import RandomWalletsCard from '@/components/RandomWalletsCard';
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
        Everything you hold, at a glance. The total counts every wallet and account (from{' '}
        <a href="https://mes.fm/assets" className="text-accent hover:underline">
          mes.fm/assets
        </a>
        ); the cards below are the parts you follow. Every transfer is on{' '}
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

      <AssetsTotalCard />

      <FreshNote savedAt={savedAt} updating={updating} error={error} />
      <StateView loading={isLoading} error={portfolio ? null : error} onRetry={refreshPrices}>
        {portfolio && <WalletBreakdown wallets={portfolio.wallets.filter((w) => w.key === 'ai' || w.key === 'mfa')} />}
      </StateView>

      <div className="grid gap-4 sm:grid-cols-2">
        <SovCard />
        <LpCard />
        <RandomWalletsCard />
      </div>
    </div>
  );
}
