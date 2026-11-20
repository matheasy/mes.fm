import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/cache';
import { cleanRow, cleanRows, type SummaryRow } from '@/lib/summary';

export const dynamic = 'force-dynamic';

/**
 * GET / POST /api/summary - mes.fm/summary's rows (one per portfolio check), kept in the shared Upstash
 * Redis without an expiry. Behind the finance password (mes.fm/middleware.js gates /finance/... and /summary).
 * POST bodies: { rows } (replace all, for an import) | { add: row } (adds or replaces that date) | { remove: date }
 * With no Redis (local dev) it answers `{ data: null }` and the page keeps rows in the browser.
 */
const KEY = 'summary:v1:rows';
const MAX = 2000;
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  const r = redisClient();
  if (!r) return NextResponse.json({ data: null }, { headers: noStore });
  const rows = cleanRows(await r.get<SummaryRow[]>(KEY));
  return NextResponse.json({ data: { rows } }, { headers: noStore });
}

export async function POST(request: Request) {
  const r = redisClient();
  if (!r) return NextResponse.json({ error: 'No database here (local preview)' }, { status: 503 });
  const text = await request.text();
  if (text.length > 600_000) return NextResponse.json({ error: 'Too big' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Not JSON' }, { status: 400 });
  }
  let rows = cleanRows(await r.get<SummaryRow[]>(KEY));
  if (Array.isArray(body.rows)) {
    rows = cleanRows(body.rows);
  } else if (body.add) {
    const row = cleanRow(body.add);
    if (!row) return NextResponse.json({ error: 'Bad row' }, { status: 400 });
    rows = cleanRows([...rows, row]);
  } else if (typeof body.remove === 'string') {
    rows = rows.filter((x) => x.d !== body.remove);
  } else {
    return NextResponse.json({ error: 'Nothing to do' }, { status: 400 });
  }
  rows = rows.slice(-MAX);
  await r.set(KEY, rows);
  return NextResponse.json({ data: { rows } }, { headers: noStore });
}
