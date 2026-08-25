'use client';

import { NETWORKS, NETWORK_LABELS } from '@/lib/config';
import type { NetworkId } from '@/lib/types';

export type NetworkSelection = NetworkId | 'all';

export default function NetworkTabs({ value, onChange }: { value: NetworkSelection; onChange: (value: NetworkSelection) => void }) {
  const options: { value: NetworkSelection; label: string }[] = [
    { value: 'all', label: 'All Networks' },
    ...NETWORKS.map((n) => ({ value: n, label: NETWORK_LABELS[n] })),
  ];

  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-bg-border bg-bg-panel p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            value === o.value ? 'bg-accent text-black font-medium' : 'text-gray-300 hover:text-accent'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
