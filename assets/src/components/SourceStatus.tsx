'use client';

import { useState } from 'react';
import { SOURCE_LABELS } from '@/lib/constants';
import { timeAgo } from '@/lib/format';
import type { GroupSummary, SourceStatus as Status } from '@/lib/types';

/** Collapsible health list: which sources answered, which are stale, which failed (and why) */
export default function SourceStatus({ sources, groups }: { sources: Status[]; groups: GroupSummary[] }) {
  const [open, setOpen] = useState(false);
  const label = Object.fromEntries(groups.map((g) => [g.key, g.label]));
  const problems = sources.filter((s) => !s.ok || s.note);
  const failed = sources.filter((s) => !s.ok).length;

  return (
    <div className="panel">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="stat-label">
          Data sources · {sources.length - failed}/{sources.length} healthy
          {problems.length > 0 && <span className="ml-2 normal-case text-yellow-300">{problems.length} with notes</span>}
        </span>
        <span className="text-xs text-gray-500">{open ? 'hide' : 'show'}</span>
      </button>

      {(open ? sources : problems).length > 0 && (
        <ul className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {(open ? sources : problems).map((s) => (
            <li key={`${s.group}-${s.source}`} className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.ok ? 'bg-gain' : 'bg-loss'}`} />
                <span className="truncate text-gray-300">
                  {SOURCE_LABELS[s.source]} <span className="text-gray-600">· {label[s.group] ?? s.group}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs text-gray-600">{s.count} · {timeAgo(s.fetchedAt)}</span>
              </div>
              {(s.error || s.note) && <p className={`pl-4 text-xs ${s.error ? 'text-loss' : 'text-yellow-300/80'}`}>{s.error ?? s.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
