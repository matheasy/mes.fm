'use client';

import type { AssetsTotal } from '@/lib/types';
import { useStoredThenLive } from './useStoredThenLive';

export function useAssetsTotal() {
  const r = useStoredThenLive<AssetsTotal>('/api/assets');
  return { ...r, assets: r.data };
}
