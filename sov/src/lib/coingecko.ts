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

/**
 * DefiLlama's keyless price API, looked up by CoinGecko coin id, at 00:00 UTC of the day (the
 * moment CoinGecko's own daily /history price is taken). Full history, unlike CoinGecko's free plan.
 * Returns null if DefiLlama has no price for that coin near that time; throws if it can't be reached.
 */
async function getDefiLlamaDailyPrice(coinId: string, date: Date): Promise<number | null> {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  const key = `coingecko:${coinId}`;
  const res = await fetch(`https://coins.llama.fi/prices/historical/${midnight}/${key}?searchWidth=12h`, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`DefiLlama price request failed: ${res.status}`);
  const json = (await res.json()) as { coins?: Record<string, { price?: number }> };
  const price = json.coins?.[key]?.price;
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * Historical USD price for a coin on a given date (day granularity) - feeds mes.fm/taxes, so accuracy
 * matters more than anything else here. DefiLlama first, CoinGecko only as a fallback, because checked
 * against Binance's own daily open (2026-09-29):
 *  - DefiLlama: BNB/ETH/BTC/CAKE/XRP within 0.2% on every sampled day; HIVE within ~2.5% back to 2020.
 *  - CoinGecko: fine for the majors when it answers, but its free plan refuses anything older than 365
 *    days, rate-limits after a handful of calls, and its /history for HIVE on 2026-03-01 said $0.0929
 *    when Binance traded $0.0641-0.0659 (DefiLlama $0.0641) - 40% off.
 * Coins are still identified by CoinGecko id (resolveCoinIdByContract), which keeps unlisted spam
 * tokens unpriced.
 *
 * Never quietly returns null for a price it merely failed to fetch - a skipped purchase would make a
 * later sale look like it cost $0. null only means neither source has a price for this coin that day;
 * if both are unreachable it throws, and the Taxes page shows the error.
 */
export async function getHistoricalPrice(coinId: string, date: Date): Promise<number | null> {
  let llamaError: unknown = null;
  try {
    const price = await getDefiLlamaDailyPrice(coinId, date);
    if (price !== null) return price;
  } catch (err) {
    llamaError = err;
  }

  try {
    const result = await get<{ market_data?: { current_price?: { usd?: number } } }>(`/coins/${coinId}/history`, {
      date: toCoingeckoDate(date),
      localization: 'false',
    });
    const usd = result.market_data?.current_price?.usd;
    return typeof usd === 'number' && usd > 0 ? usd : null;
  } catch (coingeckoError) {
    // CoinGecko's "older than 365 days" refusal isn't worth surfacing when DefiLlama simply had no price
    if (llamaError === null) return null;
    throw coingeckoError instanceof RateLimitError ? coingeckoError : llamaError;
  }
}
