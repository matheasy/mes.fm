import { RateLimitError } from './errors';

const API_BASE = 'https://api.coingecko.com/api/v3';

/**
 * USD pricing for the three assets SOV tracks: BTC (`bitcoin`), XRP (`ripple`), and HIVE
 * (`hive`, used to convert TGLD's Hive-Engine-market HIVE value into USD). All three are top-tier
 * coins resolvable by coin id, so - unlike the ai/ tracker - this needs no contract-address
 * resolution.
 */

function headers(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: headers(), next: { revalidate: 0 } });
  if (res.status === 429) throw new RateLimitError('CoinGecko rate limit reached');
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface PricePoint {
  usd: number;
  usd24hChange: number | null;
}

/** Current USD price + 24h change for a CoinGecko coin id */
export async function getCurrentPrice(coinId: string): Promise<PricePoint> {
  const result = await get<Record<string, { usd: number; usd_24h_change?: number }>>('/simple/price', {
    ids: coinId,
    vs_currencies: 'usd',
    include_24hr_change: 'true',
  });
  const entry = result[coinId];
  return { usd: entry?.usd ?? 0, usd24hChange: entry?.usd_24h_change ?? null };
}

function toCoingeckoDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Historical USD price for a coin at a given date (day granularity, as CoinGecko's free tier provides) */
export async function getHistoricalPrice(coinId: string, date: Date): Promise<number | null> {
  const result = await get<{ market_data?: { current_price?: { usd?: number } } }>(`/coins/${coinId}/history`, {
    date: toCoingeckoDate(date),
    localization: 'false',
  });
  return result.market_data?.current_price?.usd ?? null;
}
