'use client';

import { useState } from 'react';
import Breakdown from '@/components/Breakdown';
import GroupCards from '@/components/GroupCards';
import HoldingsTable from '@/components/HoldingsTable';
import RefreshButton from '@/components/RefreshButton';
import SourceStatus from '@/components/SourceStatus';
import StateView from '@/components/StateView';
import TotalCard from '@/components/TotalCard';
import { useHoldings } from '@/hooks/useHoldings';
import { DEFAULT_MIN_VALUE_USD } from '@/lib/constants';
import type { GroupKey } from '@/lib/types';

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
