'use client';

import Link from 'next/link';
import PortfolioSummary from '@/components/PortfolioSummary';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import WalletBreakdown from '@/components/WalletBreakdown';
import { usePortfolio } from '@/hooks/usePortfolio';

export default function OverviewPage() {
  const { portfolio, isLoading, error, rateLimited, refresh } = usePortfolio();

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">
        Group totals across every wallet tracked by{' '}
        <a href="https://mes.fm/ai" className="text-accent hover:underline">
          mes.fm/ai
        </a>
        ,{' '}
        <a href="https://mes.fm/mfa" className="text-accent hover:underline">
          mes.fm/mfa
        </a>
        , and{' '}
        <a href="https://mes.fm/sov" className="text-accent hover:underline">
          mes.fm/sov
        </a>{' '}
        — click any group below for its full dashboard. Combined holdings, history and transactions
        moved to those dashboards and to the{' '}
        <Link href="/transactions" className="text-accent hover:underline">
          Transactions
        </Link>{' '}
        and{' '}
        <Link href="/taxes" className="text-accent hover:underline">
          Taxes
        </Link>{' '}
        pages above. For every asset held anywhere - these three groups plus Hive, Hive Engine, and
        Magi - see{' '}
        <a href="https://mes.fm/assets" className="text-accent hover:underline">
          mes.fm/assets
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
            <a href="https://mes.fm/assets" className="panel flex items-center justify-between transition hover:border-accent">
              <div>
                <p className="stat-label">Every asset, everywhere</p>
                <p className="mt-1 text-sm text-gray-300">Hive, Hive Engine, Magi, and every EVM/XRP/BTC wallet - fetched once, shown in one place.</p>
              </div>
              <span className="text-sm text-accent">mes.fm/assets &rarr;</span>
            </a>
          </div>
        )}
      </StateView>
    </div>
  );
}
