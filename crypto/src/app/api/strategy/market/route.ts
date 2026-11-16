import { NextResponse } from 'next/server';
import { cached, cacheKey } from '@/lib/cache';
import { apiErrorResponse } from '@/lib/errors';
import { getDailySeries } from '@/lib/tax/dailyPrices';
import type { MarketInputs } from '@/lib/strategy/model';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** Coins the backtest can price (symbol on the Cash / Tokens / SOV pages -> CoinGecko id for DefiLlama) */
const COINS: Record<string, string> = { BTC: 'bitcoin', XRP: 'ripple', HIVE: 'hive', ETH: 'ethereum', BNB: 'binancecoin', LEO: 'leo-token' };
const FROM = '2021-11-01';

export interface StrategyMarket {
  asOf: string;
  inputs: MarketInputs;
  /** where each live number came from, for the page */
  live: { fngDate: string | null; signals: boolean };
  days: string[];
  /** symbol -> price per day (null = no price that day) */
  prices: Record<string, (number | null)[]>;
  fng: (number | null)[];
}

async function fngHistory(): Promise<Map<string, number>> {
  const res = await fetch('https://api.alternative.me/fng/?limit=2000', { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`alternative.me answered ${res.status}`);
  const json = (await res.json()) as { data?: { value: string; timestamp: string }[] };
  const m = new Map<string, number>();
  for (const d of json.data ?? []) m.set(new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10), Number(d.value));
  return m;
}

interface SignalsAnswer {
  sources?: {
    perps?: { ok: boolean; data?: { sym: string; apr: number }[] };
    stockfg?: { ok: boolean; data?: { score: number } };
  };
}

async function signals(): Promise<SignalsAnswer | null> {
  try {
    const res = await fetch('https://mes.fm/api/signals', { cache: 'no-store', signal: AbortSignal.timeout(25_000) });
    return res.ok ? ((await res.json()) as SignalsAnswer) : null;
  } catch {
    return null;
  }
}

async function build(): Promise<StrategyMarket> {
  const [fng, sig, ...series] = await Promise.all([
    fngHistory().catch(() => new Map<string, number>()),
    signals(),
    ...Object.values(COINS).map((id) => getDailySeries(id, FROM).catch(() => new Map<string, number>())),
  ]);
  const syms = Object.keys(COINS);
  const btc = series[0] ?? new Map<string, number>();
  if (!btc.size) throw new Error('No Bitcoin price history came back (DefiLlama) - try again in a minute');
  const days = [...btc.keys()].filter((d) => d >= FROM).sort();
  const prices: Record<string, (number | null)[]> = {};
  syms.forEach((s, i) => {
    prices[s] = days.map((d) => series[i]?.get(d) ?? null);
  });
  const fngArr = days.map((d) => fng.get(d) ?? null);

  // today's indicator inputs
  const pb = prices.BTC ?? [];
  const ph = prices.HIVE ?? [];
  const b = pb.filter((p): p is number => p != null);
  const last = b[b.length - 1] ?? 0;
  const avg200 = b.slice(-200).reduce((s, p) => s + p, 0) / Math.min(200, b.length);
  const high = Math.max(...b);
  const ratio = days.map((_, i) => (ph[i] && pb[i] ? ph[i]! / pb[i]! : null)).filter((x): x is number => x != null);
  const r90 = ratio.slice(-90);
  const fngDays = [...fng.keys()].sort();
  const fngDate = fngDays[fngDays.length - 1] ?? null;
  const perp = sig?.sources?.perps?.data?.find((p) => p.sym === 'BTC');
  const inputs: MarketInputs = {
    fng: fngDate ? fng.get(fngDate)! : null,
    mayer: last / avg200,
    drawdownPct: (last / high - 1) * 100,
    fundingApr: perp && Number.isFinite(perp.apr) ? perp.apr : null,
    stockFg: sig?.sources?.stockfg?.data?.score ?? null,
    altVs90: r90.length >= 60 ? ratio[ratio.length - 1]! / (r90.reduce((s, x) => s + x, 0) / r90.length) - 1 : null,
  };
  return { asOf: new Date().toISOString(), inputs, live: { fngDate, signals: !!sig }, days, prices, fng: fngArr };
}

/** GET /api/strategy/market - indicator inputs for today + daily price history for the backtest (cached 3 h) */
export async function GET() {
  try {
    const data = await cached<StrategyMarket>(cacheKey('strategy-market', 1), build, 3 * 3600);
    return NextResponse.json({ data });
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load the market data');
  }
}
