import { NextResponse } from 'next/server';
import { getSnapshot } from '@/apps/assets/lib/snapshot';
import { cached, cacheKey } from '@/lib/cache';
import { getCadRates } from '@/lib/cadRate';
import { fetchSource } from '@/lib/combine';
import { apiErrorResponse } from '@/lib/errors';
import { isFarmReward, isLpContract } from '@/lib/lp';
import { WALLET_SOURCES } from '@/lib/sources';
import type { ApiResult, LpEvent, LpSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface LedgerEntry {
  hash: string;
  timestamp: string;
  token: { symbol: string };
  from: string;
  to: string;
  amount: number;
  priceUsd: number | null;
}

/** The Main wallet's history, reduced to its PancakeSwap LP transactions, one event per transaction */
async function lpHistory(): Promise<{ events: LpEvent[]; error: string | null }> {
  const main = WALLET_SOURCES.find((s) => s.key === 'main');
  if (!main) return { events: [], error: 'Main wallet source missing' };
  const r = await fetchSource<{ entries: LedgerEntry[] }>(main, '/api/ledger');
  if (!r.data) return { events: [], error: r.error ?? 'Main wallet history unavailable' };

  const byHash = new Map<string, LedgerEntry[]>();
  for (const e of r.data.entries) {
    if (!isLpContract(e.from) && !isLpContract(e.to)) continue;
    const g = byHash.get(e.hash);
    if (g) g.push(e);
    else byHash.set(e.hash, [e]);
  }

  const events: LpEvent[] = [];
  for (const [hash, entries] of byHash) {
    const rewards = entries.filter((e) => e.amount > 0 && isFarmReward(e.token.symbol, e.from));
    const principal = entries.filter((e) => !rewards.includes(e));
    const usd = (e: LedgerEntry) => (e.priceUsd === null ? null : e.amount * e.priceUsd);
    const rewardsUsd = rewards.reduce((s, e) => s + (usd(e) ?? 0), 0);
    const type: LpEvent['type'] = principal.length === 0 ? 'harvest' : principal.some((e) => e.amount < 0) ? 'added' : 'removed';
    events.push({
      hash,
      timestamp: entries[0]!.timestamp,
      type,
      legs: (principal.length ? principal : rewards).map((e) => ({ symbol: e.token.symbol, amount: e.amount, valueUsd: usd(e) })),
      rewardsUsd,
    });
  }
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return { events, error: null };
}

/**
 * GET /api/lp - mes.fm/lp's data: the Main wallet's liquidity positions and unharvested farm rewards
 * (from the Assets section's snapshot, which values each position's two sides live) plus every
 * PancakeSwap add / removal / harvest from the Main wallet's ledger. Only the Main wallet on BNB
 * Chain: the Magi BTC/HBD pool on @mes is left out by request.
 */
export async function GET() {
  try {
    const data = await cached<LpSnapshot>(cacheKey('lp-snapshot'), async () => {
      const [snap, history] = await Promise.all([
        getSnapshot({ minValueUsd: 0 }),
        lpHistory().catch((err: unknown) => ({ events: [] as LpEvent[], error: err instanceof Error ? err.message : 'history unavailable' })),
      ]);
      const main = snap.holdings.filter((h) => h.group === 'main' && h.source === 'bsc');
      const positions = main
        .filter((h) => h.kind === 'lp')
        .map((h) => ({ label: h.label ?? h.symbol, detail: h.detail ?? null, valueUsd: h.valueUsd, legs: h.lp?.legs ?? [] }));
      const pendingRewards = main
        .filter((h) => h.kind === 'reward')
        .map((h) => ({ symbol: h.symbol, amount: h.amount, valueUsd: h.valueUsd, detail: h.detail ?? null }));

      const totals = { addedUsd: 0, removedUsd: 0, rewardsUsd: 0 };
      for (const ev of history.events) {
        totals.rewardsUsd += ev.rewardsUsd;
        if (ev.type === 'harvest') continue;
        const v = ev.legs.reduce((s, l) => s + Math.abs(l.valueUsd ?? 0), 0);
        if (ev.type === 'added') totals.addedUsd += v;
        else totals.removedUsd += v;
      }

      const today = new Date().toISOString().slice(0, 10);
      const rate = (await getCadRates([today])).get(today) ?? null;
      return {
        fetchedAt: snap.fetchedAt,
        cadRate: rate,
        positions,
        pendingRewards,
        totalUsd: positions.reduce((s, p) => s + (p.valueUsd ?? 0), 0) + pendingRewards.reduce((s, r) => s + (r.valueUsd ?? 0), 0),
        history: history.events,
        totals,
        historyError: history.error,
      };
    }, 300);
    return NextResponse.json({ data } satisfies ApiResult<LpSnapshot>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load the liquidity positions');
  }
}
