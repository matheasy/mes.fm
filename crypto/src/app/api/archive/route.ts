import { NextResponse } from 'next/server';
import { isOwner } from '@/lib/auth';
import { redisClient } from '@/lib/cache';
import { apiErrorResponse } from '@/lib/errors';
import { listLabels } from '@/lib/labels';
import { FILED_INDEX_KEY, readMeta, readSource, type FiledEntry } from '@/lib/store/ledgerStore';
import { STORE_SOURCES } from '@/lib/store/storeSources';
import { syncStatus } from '@/lib/store/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The full archive, for keeping a copy outside this app (the Taxes page's "Download everything", and
 * backup_finance_archive.py at the repo root). Served in parts because a response may not exceed
 * ~4.5 MB: GET = the index (sources with their status, every label and note, the saved "as filed"
 * reports' list); GET ?source=<id> = one source's stored transactions. Owner only.
 */
export async function GET(request: Request) {
  try {
    if (!isOwner(request)) return NextResponse.json({ error: 'Needs the dashboard password' }, { status: 401 });
    const id = new URL(request.url).searchParams.get('source');
    if (id) {
      if (!STORE_SOURCES.some((s) => s.id === id)) return NextResponse.json({ error: 'Unknown source' }, { status: 404 });
      const meta = await readMeta(id);
      const data = await readSource(id, meta);
      return NextResponse.json({ id, meta, tax: data?.tax ?? [], tx: data?.tx ?? [] });
    }
    const redis = redisClient();
    const [status, labels, filed] = await Promise.all([
      syncStatus(),
      listLabels(),
      redis ? redis.get<FiledEntry[]>(FILED_INDEX_KEY) : Promise.resolve(null),
    ]);
    return NextResponse.json({
      format: 'mes-finance-archive',
      version: 1,
      exportedAt: new Date().toISOString(),
      sources: STORE_SOURCES.map((s) => ({ id: s.id, label: s.label, meta: status.sources.find((m) => m.id === s.id) ?? null })),
      lastSync: status.last,
      labels,
      filed: filed ?? [],
    });
  } catch (err) {
    return apiErrorResponse(err, 'Failed to build the archive');
  }
}
