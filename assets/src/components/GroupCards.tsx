import { DEFAULT_MIN_VALUE_USD } from '@/lib/constants';
import { usd } from '@/lib/format';
import type { GroupKey, GroupSummary } from '@/lib/types';

export default function GroupCards({
  groups,
  selected,
  onSelect,
  showDust,
}: {
  groups: GroupSummary[];
  selected: GroupKey | 'all';
  onSelect: (g: GroupKey | 'all') => void;
  showDust: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => {
        const active = selected === g.key;
        const total = showDust ? g.totalAllUsd : g.totalUsd;
        return (
          <button
            key={g.key}
            onClick={() => onSelect(active ? 'all' : g.key)}
            className={`panel text-left transition hover:border-accent ${active ? 'border-accent' : ''}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="stat-label">{g.label}</p>
              {g.link && (
                <a
                  href={g.link}
                  onClick={(e) => e.stopPropagation()}
                  target={g.link.startsWith('https://mes.fm') ? undefined : '_blank'}
                  rel="noreferrer"
                  className="shrink-0 text-xs text-accent hover:underline"
                >
                  wallet &rarr;
                </a>
              )}
            </div>
            <p className="mt-1 text-2xl font-semibold">{usd(total)}</p>
            <p className="mt-1 text-xs text-gray-500">
              {g.holdingCount} {g.holdingCount === 1 ? 'asset' : 'assets'}{!showDust && g.hiddenCount > 0 ? ` · ${g.hiddenCount} under ${usd(DEFAULT_MIN_VALUE_USD, 0)} hidden` : ''}
            </p>
            {g.address && <p className="mt-2 truncate text-xs text-gray-600" title={g.address}>{g.address}</p>}
          </button>
        );
      })}
    </div>
  );
}
