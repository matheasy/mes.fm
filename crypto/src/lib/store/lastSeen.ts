import { NextResponse } from 'next/server';
import { redisClient } from '../cache';

/**
 * "Last seen" copies of the live dashboards (portfolio balances, Store of Value, Liquidity, the assets
 * total), so a page can show the last numbers instantly and swap in fresh prices when they arrive
 * (hooks/useStoredThenLive.ts) instead of a blank "Loading..." for 20 s. One small key per dashboard,
 * overwritten on every successful live answer; never expires (it is only ever a stand-in).
 */
const key = (name: string) => `ledgerstore:v1:last:${name}`;
const MAX_CHARS = 900_000;

/** `?stored=1`: the last saved answer as `{ data: { savedAt, data } | null }`; otherwise null (go live) */
export async function storedAnswer(request: Request, name: string): Promise<Response | null> {
  if (new URL(request.url).searchParams.get('stored') !== '1') return null;
  const r = redisClient();
  const v = r ? await r.get<{ savedAt: string; data: unknown }>(key(name)).catch(() => null) : null;
  return NextResponse.json({ data: v ?? null }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Saves a successful live answer (skipped if oversized; a failure never breaks the page) */
export async function remember(name: string, data: unknown): Promise<void> {
  const r = redisClient();
  if (!r) return;
  try {
    const value = { savedAt: new Date().toISOString(), data };
    if (JSON.stringify(value).length <= MAX_CHARS) await r.set(key(name), value);
  } catch {
    // only a convenience copy
  }
}
