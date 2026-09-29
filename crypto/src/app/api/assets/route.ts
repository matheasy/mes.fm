import { NextResponse } from 'next/server';
import { cached, cacheKey } from '@/lib/cache';
import { apiErrorResponse } from '@/lib/errors';
import { getSnapshot } from '@/apps/assets/lib/snapshot';
import type { ApiResult, AssetsTotal } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;


interface UpstreamGroup {
  key: string;
  label: string;
  totalUsd: number;
  totalAllUsd: number;
}

interface UpstreamSnapshot {
  fetchedAt: string;
  totalUsd: number;
  totalAllUsd: number;
  groups: UpstreamGroup[];
}

/**
 * GET /api/assets - the grand total and per-group totals from mes.fm/assets (every wallet and
 * account: Hive, Main wallet, XRP, BTC, AI, MikeFA...), for the overview's "All assets" card.
 * Only the totals are passed on, not the holdings list. Cached for 5 minutes: assets' own
 * snapshot is itself cached, this just saves the round trip on every page view.
 */
export async function GET() {
  try {
    const data = await cached<AssetsTotal>(cacheKey('assets-total'), async () => {
      // the Assets section of this same app, called directly (it was a separate app until 2026-09-29)
      const s: UpstreamSnapshot = await getSnapshot();
      return {
        fetchedAt: s.fetchedAt,
        totalUsd: s.totalUsd,
        totalAllUsd: s.totalAllUsd,
        groups: s.groups
          .map((g) => ({ key: g.key, label: g.label, totalUsd: g.totalAllUsd }))
          .filter((g) => g.totalUsd >= 1)
          .sort((a, b) => b.totalUsd - a.totalUsd),
      };
    }, 300);
    return NextResponse.json({ data } satisfies ApiResult<AssetsTotal>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load mes.fm/assets');
  }
}
