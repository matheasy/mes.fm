'use client';

import { useState } from 'react';
import { BASE_PATH } from '@/lib/basePath';

export default function RefreshButton({ onRefreshed }: { onRefreshed: () => void }) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleClick() {
    setRefreshing(true);
    try {
      await fetch(`${BASE_PATH}/api/refresh`, { method: 'POST' });
      onRefreshed();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={refreshing}
      className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent disabled:opacity-50"
    >
      {refreshing ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}
