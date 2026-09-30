import { RateLimitError } from './errors';

const API_BASE = 'https://api.coingecko.com/api/v3';

/** CoinGecko's "asset platform" id per EVM network, used to resolve a contract address to a coin id */
export const COINGECKO_PLATFORM: Record<'bsc' | 'ethereum' | 'arbitrum' | 'polygon', string> = {
  bsc: 'binance-smart-chain',
  ethereum: 'ethereum',
  arbitrum: 'arbitrum-one',
  polygon: 'polygon-pos',
};

/**
 * Current/historical USD pricing, used for: the native coin's current price on every EVM network,
 * historical prices for the cost-basis engine (needed by every network), and Ethereum/Arbitrum
 * ERC-20 current+historical prices (BEP-20 current prices come from Moralis directly instead;
 * Hyperliquid spot pricing comes from Hyperliquid's own API - see src/lib/networks/hyperliquid.ts
 * - since HyperCore assets aren't resolvable by EVM contract address here).
 */

function headers(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: headers(), next: { revalidate: 0 }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 429) throw new RateLimitError('CoinGecko rate limit reached');
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface PricePoint {
  usd: number;
  usd24hChange: number | null;
}

/** Current USD price + 24h change for any CoinGecko coin id (native coins: binancecoin/ethereum/hyperliquid) */
export async function getCurrentPrice(coinId: string): Promise<PricePoint> {
  const result = await get<Record<string, { usd: number; usd_24h_change?: number }>>('/simple/price', {
    ids: coinId,
    vs_currencies: 'usd',
    include_24hr_change: 'true',
  });
  const entry = result[coinId];
  return { usd: entry?.usd ?? 0, usd24hChange: entry?.usd_24h_change ?? null };
}

/** Resolves an EVM contract address to its CoinGecko coin id on the given platform, or null if unlisted */
export async function resolveCoinIdByContract(contractAddress: string, platform: string): Promise<string | null> {
  try {
    const result = await get<{ id: string }>(`/coins/${platform}/contract/${contractAddress.toLowerCase()}`, {});
    return result.id ?? null;
  } catch {
    return null;
  }
}

function toCoingeckoDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = date.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** DefiLlama rate-limits bursts (429): wait (Retry-After, else backing off) and retry, then give up as a RateLimitError */
async function llamaFetch(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { next: { revalidate: 0 }, signal: AbortSignal.timeout(30_000) });
    if (res.status !== 429) return res;
    if (attempt >= 5) throw new RateLimitError('DefiLlama price API rate limit reached');
    const retryAfter = Number(res.headers.get('retry-after'));
    await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1)));
  }
}

/**
 * DefiLlama's keyless price API, looked up by CoinGecko coin id, at 00:00 UTC of the day (the
 * moment CoinGecko's own daily /history price is taken). Full history, unlike CoinGecko's free plan.
 * Returns null if DefiLlama has no price for that coin near that time; throws if it can't be reached.
 */
async function getDefiLlamaDailyPrice(coinId: string, date: Date): Promise<number | null> {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  const key = `coingecko:${coinId}`;
  const res = await llamaFetch(`https://coins.llama.fi/prices/historical/${midnight}/${key}?searchWidth=12h`);
  if (!res.ok) throw new Error(`DefiLlama price request failed: ${res.status}`);
  const json = (await res.json()) as { coins?: Record<string, { price?: number }> };
  const price = json.coins?.[key]?.price;
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

/**
 * A token's USD price on a day by its contract address, straight from DefiLlama ("bsc:0x...") -
 * no CoinGecko id lookup needed, which CoinGecko's rate limit used to turn into "no price" for real
 * tokens (BTCB, ETH on BNB Chain). Only accepted when DefiLlama marks it confident (>= 0.9; absent
 * means it comes from CoinGecko's own listing), which keeps spam airdrop tokens with a sliver of fake
 * liquidity unpriced. null = no confident price; throws only if DefiLlama can't be reached.
 */
export async function getTokenDailyPriceByContract(chain: 'bsc' | 'ethereum' | 'arbitrum' | 'polygon', contract: string, date: Date): Promise<number | null> {
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 1000;
  const key = `${chain}:${contract.toLowerCase()}`;
  const res = await llamaFetch(`https://coins.llama.fi/prices/historical/${midnight}/${key}?searchWidth=12h`);
  if (!res.ok) throw new Error(`DefiLlama price request failed: ${res.status}`);
  const json = (await res.json()) as { coins?: Record<string, { price?: number; confidence?: number }> };
  const coin = json.coins?.[key];
  if (!coin || typeof coin.price !== 'number' || !(coin.price > 0)) return null;
  if (coin.confidence !== undefined && coin.confidence < 0.9) return null;
  return coin.price;
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
