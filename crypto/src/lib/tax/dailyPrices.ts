import { cached, cacheKey } from '../cache';

/**
 * Daily USD prices for the coins this app prices itself (native BTC, HIVE, HBD), from DefiLlama's
 * keyless chart API by CoinGecko id - the same source the ai/mfa/sov apps use first (see
 * ai/src/lib/coingecko.ts for the Binance cross-check that picked it: HIVE within ~2.5%, BTC within
 * ~1%, while CoinGecko's own HIVE history was 40% off on one sampled day).
 *
 * The chart endpoint returns at most 500 points per request, so history is fetched in fixed
 * 490-day chunks starting 2020-01-01, each cached in Redis - forever once the chunk lies fully in the
 * past, a few hours for the current one.
 */

const DAY = 86_400;
const CHUNK_DAYS = 490;
const EPOCH = Date.UTC(2020, 0, 1) / 1000;

export type DailySeries = Map<string, number>;

function dayKey(unixSeconds: number): string {
  // points sit near midnight UTC (sometimes 23:59 the evening before) - round to the nearest day
  return new Date(Math.round(unixSeconds / DAY) * DAY * 1000).toISOString().slice(0, 10);
}

async function fetchChunk(coinId: string, start: number): Promise<[string, number][]> {
  const key = `coingecko:${coinId}`;
  const url = `https://coins.llama.fi/chart/${key}?start=${start}&span=${CHUNK_DAYS}&period=1d&searchWidth=600`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`DefiLlama chart request failed for ${coinId}: ${res.status}`);
  const json = (await res.json()) as { coins?: Record<string, { prices?: { timestamp: number; price: number }[] }> };
  return (json.coins?.[key]?.prices ?? [])
    .filter((p) => Number.isFinite(p.price) && p.price > 0)
    .map((p) => [dayKey(p.timestamp), p.price] as [string, number]);
}

/** Every daily price for `coinId` from `fromIso` (clamped to 2020-01-01) until today */
export async function getDailySeries(coinId: string, fromIso: string): Promise<DailySeries> {
  const now = Date.now() / 1000;
  const from = Math.max(EPOCH, Math.floor(new Date(fromIso).getTime() / 1000));
  const firstChunk = EPOCH + Math.floor((from - EPOCH) / (CHUNK_DAYS * DAY)) * CHUNK_DAYS * DAY;

  const starts: number[] = [];
  for (let s = firstChunk; s < now; s += CHUNK_DAYS * DAY) starts.push(s);

  const chunks = await Promise.all(
    starts.map((s) => {
      const complete = s + CHUNK_DAYS * DAY < now - 2 * DAY;
      return cached(cacheKey('llama-daily', coinId, new Date(s * 1000).toISOString().slice(0, 10)), () => fetchChunk(coinId, s), complete ? undefined : 3 * 3600);
    }),
  );

  const series: DailySeries = new Map();
  for (const chunk of chunks) for (const [d, p] of chunk) series.set(d, p);
  return series;
}

/** The price on `iso`'s UTC date, or the nearest earlier day within a week (gaps in the source) */
export function priceOn(series: DailySeries, iso: string): number | null {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  for (let i = 0; i < 7; i++) {
    const p = series.get(d.toISOString().slice(0, 10));
    if (p !== undefined) return p;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return null;
}
