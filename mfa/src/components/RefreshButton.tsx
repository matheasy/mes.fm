'use client';

import { useState } from 'react';
import { BASE_PATH } from '@/lib/basePath';

export default function RefreshButton({
  onRefreshed,
  disabledReason,
}: {
  onRefreshed: () => void;
  /** When set, the button is disabled and this text renders to its left explaining why */
  disabledReason?: string;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const disabled = refreshing || Boolean(disabledReason);

  async function handleClick() {
    if (disabledReason) return;
    setRefreshing(true);
    try {
      await fetch(`${BASE_PATH}/api/refresh`, { method: 'POST' });
      onRefreshed();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {disabledReason && <span className="text-xs text-gray-500">{disabledReason}</span>}
      <button
        onClick={handleClick}
        disabled={disabled}
        className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-bg-border disabled:hover:text-gray-200"
      >
        {refreshing ? 'Refreshing Data…' : 'Refresh Data'}
      </button>
    </div>
  );
}
