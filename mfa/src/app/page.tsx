'use client';

import AllocationChart from '@/components/AllocationChart';
import HoldingsTable from '@/components/HoldingsTable';
import PortfolioSummary from '@/components/PortfolioSummary';
import RefreshButton from '@/components/RefreshButton';
import StateView from '@/components/StateView';
import { usePortfolio } from '@/hooks/usePortfolio';

export default function OverviewPage() {
  const { portfolio, isLoading, error, refresh } = usePortfolio();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <RefreshButton onRefreshed={refresh} />
      </div>

      <StateView loading={isLoading} error={error} onRetry={refresh}>
        {portfolio && (
          <div className="flex flex-col gap-6">
            <PortfolioSummary summary={portfolio} />
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <HoldingsTable holdings={portfolio.holdings} />
              <AllocationChart holdings={portfolio.holdings} />
            </div>
          </div>
        )}
      </StateView>
    </div>
  );
}
