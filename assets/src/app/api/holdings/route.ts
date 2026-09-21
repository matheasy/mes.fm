import { NextResponse } from 'next/server';
import { DEFAULT_MIN_VALUE_USD, GROUPS, SOURCE_LABELS } from '@/lib/config';
import { apiErrorResponse } from '@/lib/errors';
import { getSnapshot } from '@/lib/snapshot';
import type { ApiResult, AssetsSnapshot, GroupKey, SourceId } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/holdings?minValueUsd=10&group=main&source=ethereum
 *
 * The single data feed other dashboards read (mes.fm/ai, /mfa, /sov, /portfolio) instead of calling
 * the chain/price APIs themselves. `minValueUsd` defaults to 10 (the assets page's rule); consumers
 * that want dust too ask for `minValueUsd=0`.
 */
export async function GET(request: Request) {
  try {
    const sp = new URL(request.url).searchParams;

    const min = sp.get('minValueUsd');
    const minValueUsd = min !== null && Number.isFinite(Number(min)) && Number(min) >= 0 ? Number(min) : DEFAULT_MIN_VALUE_USD;

    const g = sp.get('group');
    const group = GROUPS.some((x) => x.key === g) ? (g as GroupKey) : undefined;
    const s = sp.get('source');
    const source = s && s in SOURCE_LABELS ? (s as SourceId) : undefined;

    const data = await getSnapshot({ minValueUsd, group, source });
    return NextResponse.json({ data } satisfies ApiResult<AssetsSnapshot>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load assets');
  }
}
