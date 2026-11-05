'use client';

import { useAssetsTotal } from '@/hooks/useAssetsTotal';
import { useStoredThenLive } from '@/hooks/useStoredThenLive';
import type { BucketSnapshot, CombinedPortfolio, LpSnapshot, SovSnapshot } from '@/lib/types';

const usd = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * One line under the overview's cards: what the six sections add up to, next to the grand total, so
 * the two can be compared. Each holding sits in one section only (lib/sections.ts); the gap is small
 * holdings the sections leave out (tokens under $10, dust) and the moments between price updates.
 */
export default function SectionsCheck({ portfolio }: { portfolio?: CombinedPortfolio }) {
  const { assets } = useAssetsTotal();
  const sov = useStoredThenLive<SovSnapshot>('/api/sov').data;
  const lp = useStoredThenLive<LpSnapshot>('/api/lp').data;
  const cash = useStoredThenLive<BucketSnapshot>('/api/cash').data;
  const tokens = useStoredThenLive<BucketSnapshot>('/api/tokens').data;
  if (!assets || !portfolio || !sov || !lp || !cash || !tokens) return null;
  const wallet = (k: string) => portfolio.wallets.find((w) => w.key === k)?.totalValueUsd ?? 0;
  const parts = wallet('ai') + wallet('mfa') + sov.totalUsd + lp.totalUsd + cash.totalUsd + tokens.totalUsd;
  const gap = assets.totalAllUsd - parts;
  return (
    <p className="text-xs text-gray-500">
      The six sections add up to <strong className="text-gray-300">{usd(parts)}</strong> of the {usd(assets.totalAllUsd)} total
      {Math.abs(gap) >= 1 && (
        <>
          {' '}
          ({gap > 0 ? `${usd(gap)} not in any section` : `${usd(-gap)} more than the total`}: small tokens under $10, dust, and prices read at
          slightly different moments)
        </>
      )}
      . Each holding is counted in one section only.
    </p>
  );
}
