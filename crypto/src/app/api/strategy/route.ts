import { NextResponse } from 'next/server';
import { redisClient } from '@/lib/cache';
import { normalize, type LogEntry, type Settings } from '@/lib/strategy/model';
import { normalize3, type Settings3 } from '@/lib/strategy/bands';

export const dynamic = 'force-dynamic';

/**
 * GET / POST /api/strategy - mes.fm/strategy's saved settings and its log of moves done, kept in the
 * shared Upstash Redis without an expiry (durable, like the Taxes labels). Behind the same password
 * as the other finance pages (mes.fm/middleware.js gates /finance/...). With no Redis (local dev) it
 * answers `{ data: null }` and the page keeps everything in the browser instead.
 *
 * POST bodies: { settings3 } (the band strategy, 2026-11-27) | { settings } (old v2) | { add: LogEntry } | { remove: id }
 */
const SKEY = 'strategy:v1:settings';
const LKEY = 'strategy:v1:log';
const S3KEY = 'strategy:v3:settings';
const MAX_LOG = 2000;

export interface StrategyStore {
  settings: Settings | null;
  settings3: Settings3 | null;
  log: LogEntry[];
}

function cleanEntry(e: unknown): LogEntry | null {
  if (!e || typeof e !== 'object') return null;
  const x = e as Record<string, unknown>;
  const b = (v: unknown) => v === 'cash' || v === 'lp' || v === 'tokens' || v === 'sov';
  if (typeof x.id !== 'string' || typeof x.moveId !== 'string' || typeof x.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) return null;
  if (!b(x.from) || !b(x.to)) return null;
  const usd = Number(x.usd);
  if (!Number.isFinite(usd) || usd < 0 || usd > 1e9) return null;
  const cad = Number(x.cad);
  const lpUsd = Number(x.lpUsd);
  return {
    id: x.id.slice(0, 40),
    moveId: x.moveId.slice(0, 20),
    date: x.date,
    usd,
    from: x.from as LogEntry['from'],
    to: x.to as LogEntry['to'],
    cad: Number.isFinite(cad) && cad > 0 && cad < 10 ? cad : undefined,
    lpUsd: Number.isFinite(lpUsd) && lpUsd > 0 && lpUsd <= usd ? lpUsd : undefined,
    note: typeof x.note === 'string' ? x.note.slice(0, 300) : undefined,
    skipped: x.skipped === true || undefined,
  };
}

export async function GET() {
  const r = redisClient();
  if (!r) return NextResponse.json({ data: null }, { headers: { 'Cache-Control': 'no-store' } });
  const [s, s3, l] = await Promise.all([r.get<Settings>(SKEY), r.get<Settings3>(S3KEY), r.get<LogEntry[]>(LKEY)]);
  const data: StrategyStore = { settings: s ? normalize(s) : null, settings3: s3 ? normalize3(s3) : null, log: Array.isArray(l) ? l : [] };
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const r = redisClient();
  if (!r) return NextResponse.json({ error: 'No database here (local preview): saved in this browser only' }, { status: 503 });
  const text = await request.text();
  if (text.length > 60_000) return NextResponse.json({ error: 'Too big' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Not JSON' }, { status: 400 });
  }
  if (body.settings3) {
    const s = normalize3(body.settings3);
    await r.set(S3KEY, s);
    return NextResponse.json({ data: { settings3: s } });
  }
  if (body.settings) {
    const s = normalize(body.settings);
    await r.set(SKEY, s);
    return NextResponse.json({ data: { settings: s } });
  }
  const log = ((await r.get<LogEntry[]>(LKEY)) ?? []).filter(Boolean);
  if (body.add) {
    const e = cleanEntry(body.add);
    if (!e) return NextResponse.json({ error: 'Bad log entry' }, { status: 400 });
    const next = [e, ...log.filter((x) => x.id !== e.id)].slice(0, MAX_LOG);
    await r.set(LKEY, next);
    return NextResponse.json({ data: { log: next } });
  }
  if (typeof body.remove === 'string') {
    const next = log.filter((x) => x.id !== body.remove);
    await r.set(LKEY, next);
    return NextResponse.json({ data: { log: next } });
  }
  return NextResponse.json({ error: 'Nothing to do' }, { status: 400 });
}
