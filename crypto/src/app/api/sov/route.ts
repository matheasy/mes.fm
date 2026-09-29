import { NextResponse } from 'next/server';
import { cached, cacheKey } from '@/lib/cache';
import { getCadRates } from '@/lib/cadRate';
import { apiErrorResponse } from '@/lib/errors';
import type { ApiResult, SovAsset, SovSnapshot } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HE_RPC = 'https://api.hive-engine.com/rpc/contracts';
const HIVE_ACCOUNTS = ['mes', 'mestruth', 'mathiew', 'artgrafiken'];

async function heFind<T>(method: 'find' | 'findOne', contract: string, table: string, query: Record<string, unknown>): Promise<T> {
  const res = await fetch(HE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: { contract, table, query, limit: 1000 } }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Hive Engine answered ${res.status}`);
  return ((await res.json()) as { result: T }).result;
}

/**
 * TGLD read straight from Hive Engine: mes.fm/assets drops it, because its market's last trade is a
 * dust fill (0.001 TGLD at 0.00003 HIVE) that values the holding at under a cent. The order book
 * (2026-09-29) has no real bids at all - highest 0.00003 HIVE - and the cheapest ask is ~16.8 HIVE,
 * so there's no honest current price: it's shown with the ask for reference and left out of the total.
 */
async function tgld(): Promise<SovAsset | null> {
  const [balances, metrics] = await Promise.all([
    heFind<{ account: string; balance: string; stake?: string; pendingUnstake?: string; delegationsOut?: string }[]>('find', 'tokens', 'balances', {
      symbol: 'TGLD',
      account: { $in: HIVE_ACCOUNTS },
    }),
    heFind<{ lowestAsk?: string } | null>('findOne', 'market', 'metrics', { symbol: 'TGLD' }),
  ]);
  const lines = balances
    .map((b) => ({ account: b.account, amount: ['balance', 'stake', 'pendingUnstake', 'delegationsOut'].reduce((s, k) => s + (Number(b[k as keyof typeof b]) || 0), 0) }))
    .filter((l) => l.amount > 0);
  if (!lines.length) return null;
  const ask = metrics?.lowestAsk ? Number(metrics.lowestAsk) : null;
  return {
    asset: 'TGLD',
    amount: lines.reduce((s, l) => s + l.amount, 0),
    valueUsd: 0,
    noMarket: { lowestAskHive: ask && Number.isFinite(ask) ? ask : null },
    lines: lines.map((l) => ({ where: `Hive @${l.account}`, source: 'hive-engine', symbol: 'TGLD', label: 'TGLD', amount: l.amount, valueUsd: null })),
  };
}

const ASSETS_SOURCE_URL = process.env.ASSETS_SOURCE_URL ?? 'https://mes-fm-assets.vercel.app/assets';

/** Same allowlist as assets/src/lib/btc.ts: every 1:1 wrapped form of Bitcoin, summed as BTC */
const BTC_SYMBOLS = new Set(['BTC', 'BTCB', 'WBTC', 'CBBTC', 'RENBTC', 'HBTC', 'TBTC', 'SWAP.BTC']);

function assetOf(symbol: string): SovAsset['asset'] | null {
  const s = symbol.toUpperCase();
  if (BTC_SYMBOLS.has(s)) return 'BTC';
  if (s === 'XRP') return 'XRP';
  if (s === 'TGLD') return 'TGLD';
  return null;
}

interface UpstreamHolding {
  symbol: string;
  kind: string;
  label?: string;
  amount: number;
  valueUsd: number | null;
  group: string;
  source: string;
}

interface UpstreamSnapshot {
  fetchedAt: string;
  groups: { key: string; label: string }[];
  holdings: UpstreamHolding[];
}

/**
 * GET /api/sov - mes.fm/sov's data: the Store of Value holdings (Bitcoin in every form, XRP, TGLD)
 * picked out of mes.fm/assets' snapshot, across every wallet and account, with today's USD/CAD rate.
 * mes.fm/sov used to be its own app and Vercel project; it's now this page, reading the one
 * place that already fetches every balance. Its cost side (ACB) comes from the Taxes calculation.
 */
export async function GET() {
  try {
    const data = await cached<SovSnapshot>(cacheKey('sov-snapshot'), async () => {
      const res = await fetch(`${ASSETS_SOURCE_URL}/api/holdings?minValueUsd=0`, { cache: 'no-store' });
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) throw new Error(`mes.fm/assets did not answer (HTTP ${res.status})`);
      const json = (await res.json()) as ApiResult<UpstreamSnapshot>;
      if (!json.data) throw new Error(json.error ?? 'mes.fm/assets returned no data');
      const snap = json.data;
      const groupLabel = new Map(snap.groups.map((g) => [g.key, g.label]));

      const byAsset = new Map<SovAsset['asset'], SovAsset>();
      for (const h of snap.holdings) {
        const asset = assetOf(h.symbol);
        if (!asset || asset === 'TGLD' || h.kind === 'lp' || !(h.amount > 0)) continue; // LP shares aren't the coin itself; TGLD: see tgld()
        const a = byAsset.get(asset) ?? { asset, amount: 0, valueUsd: 0, lines: [] };
        a.amount += h.amount;
        a.valueUsd += h.valueUsd ?? 0;
        a.lines.push({ where: groupLabel.get(h.group) ?? h.group, source: h.source, symbol: h.symbol, label: h.label ?? h.symbol, amount: h.amount, valueUsd: h.valueUsd });
        byAsset.set(asset, a);
      }
      for (const a of byAsset.values()) a.lines.sort((x, y) => (y.valueUsd ?? 0) - (x.valueUsd ?? 0));
      const t = await tgld().catch(() => null);
      if (t) byAsset.set('TGLD', t);

      const today = new Date().toISOString().slice(0, 10);
      const rate = (await getCadRates([today])).get(today) ?? null;
      const assets = (['BTC', 'XRP', 'TGLD'] as const).map((k) => byAsset.get(k)).filter((a): a is SovAsset => !!a);
      return { fetchedAt: snap.fetchedAt, cadRate: rate, totalUsd: assets.reduce((s, a) => s + a.valueUsd, 0), assets };
    }, 300);
    return NextResponse.json({ data } satisfies ApiResult<SovSnapshot>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load the Store of Value holdings');
  }
}
