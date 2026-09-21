import { DEFAULT_MIN_VALUE_USD } from '@/lib/constants';
import { timeAgo, usd } from '@/lib/format';
import type { AssetsSnapshot } from '@/lib/types';

export default function TotalCard({ snapshot, showDust, onToggleDust }: { snapshot: AssetsSnapshot; showDust: boolean; onToggleDust: () => void }) {
  const threshold = DEFAULT_MIN_VALUE_USD;
  return (
    <div className="panel">
      <p className="stat-label">Total Assets</p>
      <p className="mt-1 text-3xl font-semibold">{usd(showDust ? snapshot.totalAllUsd : snapshot.totalUsd)}</p>
      <p className="mt-2 text-sm text-gray-400">
        {showDust ? (
          <>
            Everything, including {snapshot.holdings.length} {snapshot.holdings.length === 1 ? 'asset' : 'assets'} of any size.{' '}
          </>
        ) : (
          <>
            {snapshot.holdings.length} {snapshot.holdings.length === 1 ? 'asset' : 'assets'} worth ≥ {usd(threshold, 0)}.{' '}
            {snapshot.hiddenCount > 0 && (
              <>
                {snapshot.hiddenCount} smaller {snapshot.hiddenCount === 1 ? 'asset' : 'assets'} ({usd(snapshot.hiddenUsd)}) hidden.{' '}
              </>
            )}
          </>
        )}
        <button onClick={onToggleDust} className="text-accent hover:underline">
          {showDust ? `Show only ≥ ${usd(threshold, 0)}` : 'Show all'}
        </button>
      </p>
      <p className="mt-3 text-xs text-gray-500">updated {timeAgo(snapshot.fetchedAt)}</p>
    </div>
  );
}
