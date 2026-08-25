import { NETWORK_LABELS } from '@/lib/config';
import type { NetworkError, NetworkId } from '@/lib/types';

/**
 * Renders one line per network that failed to load, without blocking the rest of the page - the
 * whole point of per-network fault isolation is that a dead/rate-limited network shows a small
 * inline notice here while every other network's data still renders normally above.
 */
export default function NetworkErrorBanner({ networkErrors }: { networkErrors: Partial<Record<NetworkId, NetworkError>> }) {
  const entries = Object.entries(networkErrors) as [NetworkId, NetworkError][];
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-loss/40 bg-loss/5 px-3 py-2 text-xs text-loss">
      {entries.map(([network, err]) => (
        <span key={network}>
          {NETWORK_LABELS[network]}: {err.rateLimited ? 'rate limited' : 'failed to load'} — {err.message}
        </span>
      ))}
    </div>
  );
}
