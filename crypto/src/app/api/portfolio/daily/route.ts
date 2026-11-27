import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/cache';
import { cleanDaily, cleanDailyRows, utcToday, type DailyRow } from '@/lib/portfolioDaily';

export const dynamic = 'force-dynamic';

/**
 * GET / POST /api/portfolio/daily - the overview chart's history: one row a day of each section's value,
 * kept in the shared Upstash Redis without an expiry (one small key, ~100 bytes a day). Behind the finance
 * password (middleware gates /finance/...). POST { add: row } stores TODAY's row only (any other date is
 * refused), so a page can't rewrite the past. No Redis (local dev) -> `{ data: null }`.
 */
const KEY = 'portfolio:daily:v1';
const MAX = 4000;
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  const r = redisClient();
  if (!r) return NextResponse.json({ data: null }, { headers: noStore });
  const rows = cleanDailyRows(await r.get<DailyRow[]>(KEY));
  return NextResponse.json({ data: { rows } }, { headers: noStore });
}

export async function POST(request: Request) {
  const r = redisClient();
  if (!r) return NextResponse.json({ error: 'No database here (local preview)' }, { status: 503 });
  const text = await request.text();
  if (text.length > 4000) return NextResponse.json({ error: 'Too big' }, { status: 413 });
  let body: { add?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Not JSON' }, { status: 400 });
  }
  const row = cleanDaily(body.add);
  if (!row || row.d !== utcToday()) return NextResponse.json({ error: "Only today's row can be saved" }, { status: 400 });
  const rows = cleanDailyRows([...cleanDailyRows(await r.get<DailyRow[]>(KEY)), row]).slice(-MAX);
  await r.set(KEY, rows);
  return NextResponse.json({ data: { saved: row.d, count: rows.length } }, { headers: noStore });
}
