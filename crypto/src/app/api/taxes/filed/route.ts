import { NextResponse } from 'next/server';
import { isOwner } from '@/lib/auth';
import { redisClient } from '@/lib/cache';
import { apiErrorResponse } from '@/lib/errors';
import { FILED_INDEX_KEY, getDocument, putDocument, type FiledEntry } from '@/lib/store/ledgerStore';
import { reportToCsv } from '@/lib/tax/csv';
import { buildTaxReport } from '@/lib/tax/report';
import type { ApiResult, TaxesResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Frozen copies of a year's report "as filed" - for a CRA review years later, the exact rows, totals,
 * labels and notes the return was based on, even if prices, labels or the calculation change since.
 * GET = the list; GET ?id=<id> = one copy as JSON (&format=csv for the CSV); POST {year, note} = save
 * the current report for that year. Saved copies are never changed or deleted by the app.
 */
export async function GET(request: Request) {
  try {
    if (!isOwner(request)) return NextResponse.json({ error: 'Needs the dashboard password' }, { status: 401 });
    const redis = redisClient();
    if (!redis) throw new Error('The database is not configured');
    const id = new URL(request.url).searchParams.get('id');
    if (!id) {
      const list = (await redis.get<FiledEntry[]>(FILED_INDEX_KEY)) ?? [];
      return NextResponse.json({ data: list } satisfies ApiResult<FiledEntry[]>);
    }
    const doc = await getDocument<{ entry: FiledEntry; report: TaxesResponse }>(`filed:${id}`);
    if (!doc) return NextResponse.json({ error: 'No such saved report' }, { status: 404 });
    const csv = new URL(request.url).searchParams.get('format') === 'csv';
    const name = `mes-crypto-taxes-${doc.entry.year}-as-filed-${doc.entry.savedAt.slice(0, 10)}`;
    return new Response(csv ? reportToCsv(doc.report) : JSON.stringify(doc, null, 1), {
      headers: {
        'Content-Type': csv ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.${csv ? 'csv' : 'json'}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err, 'Failed to read the saved reports');
  }
}

export async function POST(request: Request) {
  try {
    if (!isOwner(request)) return NextResponse.json({ error: 'Needs the dashboard password' }, { status: 401 });
    const redis = redisClient();
    if (!redis) throw new Error('The database is not configured');
    const body = (await request.json().catch(() => ({}))) as { year?: unknown; note?: unknown };
    const year = Number(body.year);
    if (!Number.isInteger(year) || year < 2015 || year > 2100) return NextResponse.json({ error: 'Which tax year?' }, { status: 400 });
    const report = await buildTaxReport({ year });
    const savedAt = new Date().toISOString();
    const entry: FiledEntry = {
      id: `${year}-${savedAt.replace(/[:.]/g, '-')}`,
      year,
      savedAt,
      gainCad: report.summary.gainCad,
      incomeCad: report.income.totalCad,
      rows: report.rows.length,
      note: typeof body.note === 'string' ? body.note.slice(0, 300) : '',
    };
    await putDocument(`filed:${entry.id}`, { entry, report });
    const list = (await redis.get<FiledEntry[]>(FILED_INDEX_KEY)) ?? [];
    await redis.set(FILED_INDEX_KEY, [entry, ...list]);
    return NextResponse.json({ data: entry } satisfies ApiResult<FiledEntry>);
  } catch (err) {
    return apiErrorResponse(err, 'Could not save the report');
  }
}
