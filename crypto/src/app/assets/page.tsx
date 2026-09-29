'use client';

import { useState } from 'react';
import BitcoinSummary from '@/apps/assets/components/BitcoinSummary';
import Breakdown from '@/apps/assets/components/Breakdown';
import GroupCards from '@/apps/assets/components/GroupCards';
import HiveSummary from '@/apps/assets/components/HiveSummary';
import HoldingsTable from '@/apps/assets/components/HoldingsTable';
import RefreshButton from '@/apps/assets/components/RefreshButton';
import SourceStatus from '@/apps/assets/components/SourceStatus';
import StateView from '@/apps/assets/components/StateView';
import TotalCard from '@/apps/assets/components/TotalCard';
import { useHoldings } from '@/apps/assets/hooks/useHoldings';
import { DEFAULT_MIN_VALUE_USD } from '@/apps/assets/lib/constants';
import type { GroupKey } from '@/apps/assets/lib/types';

export default function OverviewPage() {
  const [showDust, setShowDust] = useState(false);
  const [group, setGroup] = useState<GroupKey | 'all'>('all');
  const { snapshot, isLoading, isValidating, error, refresh } = useHoldings(showDust ? 0 : DEFAULT_MIN_VALUE_USD);

  const holdings = snapshot ? snapshot.holdings.filter((h) => group === 'all' || h.group === group) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-gray-400">
          Everything held across Hive, Hive Engine, Magi, and the EVM / Hyperliquid / XRP wallets — fetched once here, then shared with the other
          dashboards. Shows assets worth ≥ ${DEFAULT_MIN_VALUE_USD} unless you ask for all.
        </p>
        <div className="flex items-center gap-3">
          {isValidating && !isLoading && <span className="text-xs text-gray-500">updating…</span>}
          <RefreshButton onRefreshed={refresh} />
        </div>
      </div>

      <StateView loading={isLoading} error={snapshot ? null : error} onRetry={refresh}>
        {snapshot && (
          <div className="flex flex-col gap-6">
            <TotalCard snapshot={snapshot} showDust={showDust} onToggleDust={() => setShowDust(!showDust)} />
            <BitcoinSummary holdings={holdings} groups={snapshot.groups} />
            <HiveSummary holdings={holdings} groups={snapshot.groups} />
            <GroupCards groups={snapshot.groups} selected={group} onSelect={setGroup} showDust={showDust} />
            <Breakdown holdings={holdings} groups={snapshot.groups} />
            <HoldingsTable holdings={holdings} groups={snapshot.groups} />
            <SourceStatus sources={snapshot.sources} groups={snapshot.groups} />
          </div>
        )}
      </StateView>
    </div>
  );
}
