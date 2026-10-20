import { NextResponse } from 'next/server';
import { isCron, isOwner } from '@/lib/auth';
import { apiErrorResponse } from '@/lib/errors';
import { STORE_SOURCES } from '@/lib/store/storeSources';
import { runSync, syncStatus, type SyncStatus } from '@/lib/store/sync';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface SyncAnswer {
  started: boolean;
  reason?: string;
  status: SyncStatus;
}

/**
 * GET /api/sync - when the stored transactions were last updated (the pages' "Last synced" line).
 * GET /api/sync?run=1 from Vercel's daily cron runs a sync. POST runs one now (the page's "Sync now",
 * and the page itself when the last sync is old); a sync that started a moment ago is not repeated.
 * POST {"rebuild": ["evm:main:bsc"]} replaces those sources' stored copies with a fresh one even if it
 * is missing rows - only for the owner (Basic Auth), since it is the one way records can be dropped.
 */
export async function GET(request: Request) {
  try {
    if (new URL(request.url).searchParams.get('run') === '1' && isCron(request)) {
      const r = await runSync({ trigger: 'daily' });
      return NextResponse.json({ data: { started: r.started, reason: r.reason, status: await syncStatus() } } satisfies ApiResult<SyncAnswer>);
    }
    return NextResponse.json({ data: { started: false, status: await syncStatus() } } satisfies ApiResult<SyncAnswer>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to read the sync status');
  }
}

export async function POST(request: Request) {
  try {
    let body: { rebuild?: unknown; trigger?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      // no body = a plain sync
    }
    const ids = new Set(STORE_SOURCES.map((s) => s.id));
    const rebuild = Array.isArray(body.rebuild) ? body.rebuild.filter((x): x is string => typeof x === 'string' && ids.has(x)) : [];
    if (rebuild.length && !isOwner(request)) {
      return NextResponse.json({ error: 'Rebuilding a stored source needs the dashboard password' } satisfies ApiResult<SyncAnswer>, { status: 401 });
    }
    const trigger = body.trigger === 'auto' ? 'page (auto)' : rebuild.length ? `rebuild ${rebuild.join(', ')}` : 'Sync now';
    const r = await runSync({ trigger, rebuild });
    return NextResponse.json({ data: { started: r.started, reason: r.reason, status: await syncStatus() } } satisfies ApiResult<SyncAnswer>);
  } catch (err) {
    return apiErrorResponse(err, 'The sync failed');
  }
}
