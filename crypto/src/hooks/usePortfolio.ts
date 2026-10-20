'use client';

import type { CombinedPortfolio } from '@/lib/types';
import { useStoredThenLive } from './useStoredThenLive';

/** The combined wallets: the last saved numbers at once, then the live ones (see useStoredThenLive) */
export function usePortfolio() {
  const r = useStoredThenLive<CombinedPortfolio>('/api/portfolio');
  return { ...r, portfolio: r.data };
}
