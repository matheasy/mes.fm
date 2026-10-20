'use client';

import { useMemo, useState } from 'react';
import Breakdown from '@/apps/assets/components/Breakdown';
import GroupedTable from '@/apps/assets/components/GroupedTable';
import RefreshButton from '@/apps/assets/components/RefreshButton';
import StateView from '@/apps/assets/components/StateView';
import { useHoldings } from '@/apps/assets/hooks/useHoldings';
import { groupHoldings } from '@/apps/assets/lib/assetGroups';
import { DEFAULT_MIN_VALUE_USD, SOURCE_LABELS } from '@/apps/assets/lib/constants';
import { timeAgo, usd } from '@/apps/assets/lib/format';

/**
 * mes.fm/assets, kept simple on request (2026-10-19): the total, one table with every asset and its
 * wrapped forms folded under it (GroupedTable), with two donuts above it (by asset, by type). The per-account
 * cards, Bitcoin / Hive summaries and the source list were dropped; a source that failed still shows
 * as one warning line.
 */
export default function AssetsPage() {
  const [showDust, setShowDust] = useState(false);
  const { snapshot, isLoading, isValidating, error, refresh } = useHoldings(showDust ? 0 : DEFAULT_MIN_VALUE_USD);
  const groups = useMemo(() => (snapshot ? groupHoldings(snapshot.holdings) : []), [snapshot]);
  const failed = snapshot ? snapshot.sources.filter((s) => !s.ok) : [];

  return (
    <div className="flex flex-col gap-6">
      <StateView loading={isLoading} error={snapshot ? null : error} onRetry={refresh}>
        {snapshot && (
          <div className="flex flex-col gap-6">
            <div className="panel flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="stat-label">Total · everything you hold</p>
                <p className="mt-1 text-3xl font-semibold">{usd(showDust ? snapshot.totalAllUsd : snapshot.totalUsd)}</p>
                <p className="mt-1 text-xs text-gray-500">
                  {groups.length} assets · updated {timeAgo(snapshot.fetchedAt)}
                  {isValidating && !isLoading ? ' · updating…' : ''} ·{' '}
                  <button type="button" onClick={() => setShowDust(!showDust)} className="text-accent hover:underline">
                    {showDust ? `only show ≥ ${usd(DEFAULT_MIN_VALUE_USD, 0)}` : snapshot.hiddenCount ? `show ${snapshot.hiddenCount} small ones (${usd(snapshot.hiddenUsd)})` : 'show small ones'}
                  </button>
                </p>
              </div>
              <RefreshButton onRefreshed={refresh} />
            </div>

            {failed.length > 0 && (
              <p className="text-xs text-yellow-300">
                Couldn&apos;t read right now: {[...new Set(failed.map((s) => SOURCE_LABELS[s.source] ?? s.source))].join(', ')} - their balances may be missing from the total.
                {' '}
                <span className="text-gray-500">({[...new Set(failed.map((s) => s.error).filter(Boolean))].join('; ')})</span>
              </p>
            )}

            <Breakdown holdings={snapshot.holdings} assets={groups} />
            <GroupedTable groups={groups} accounts={snapshot.groups} />
          </div>
        )}
      </StateView>
    </div>
  );
}
