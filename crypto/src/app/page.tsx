'use client';

import AssetsTotalCard from '@/components/AssetsTotalCard';
import PortfolioSummary from '@/components/PortfolioSummary';
import RefreshButton from '@/components/RefreshButton';
import SovCard from '@/components/SovCard';
import StateView from '@/components/StateView';
import WalletBreakdown from '@/components/WalletBreakdown';
import { usePortfolio } from '@/hooks/usePortfolio';

export default function OverviewPage() {
  const { portfolio, isLoading, error, rateLimited, refresh } = usePortfolio();

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
        </a>{' '}
        and{' '}
        <a href="https://mes.fm/sov" className="text-accent hover:underline">
          Store of Value
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

      <div className="flex items-center justify-end">
        <RefreshButton onRefreshed={refresh} disabledReason={rateLimited ? (error ?? 'Usage limit reached') : undefined} />
      </div>

      <StateView loading={isLoading} error={rateLimited && portfolio ? null : error} onRetry={refresh}>
        {portfolio && (
          <div className="flex flex-col gap-6">
            <PortfolioSummary summary={portfolio} />
            <WalletBreakdown wallets={portfolio.wallets} />
          </div>
        )}
      </StateView>

      <SovCard />

      <AssetsTotalCard />
    </div>
  );
}
