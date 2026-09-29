import { cacheGet, cacheKey, cacheSet, cached } from './cache';
import { TTL } from './config';
import { fetchJson } from './http';

const API_BASE = 'https://api.coingecko.com/api/v3';

export interface Quote {
  usd: number;
  change24h: number | null;
}

function headers(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

const hasKey = () => Boolean(process.env.COINGECKO_API_KEY);

/** CoinGecko coin ids for every native/base asset this app prices directly */
export const SPOT_IDS = ['hive', 'hive_dollar', 'bitcoin', 'ethereum', 'binancecoin', 'ripple', 'hyperliquid', 'polygon-ecosystem-token', 'pancakeswap-token'] as const;
export type SpotId = (typeof SPOT_IDS)[number];
export type Spot = Record<SpotId, Quote>;

/** One CoinGecko call prices every base asset; shared by all sources for the TTL */
export async function getSpot(): Promise<Spot> {
  return cached(cacheKey('price', 'spot'), TTL.spotPrice, async () => {
    const json = await fetchJson<Record<string, { usd?: number; usd_24h_change?: number | null }>>(
      `${API_BASE}/simple/price?ids=${SPOT_IDS.join(',')}&vs_currencies=usd&include_24hr_change=true`,
      { headers: headers(), throttle: { key: 'coingecko', minIntervalMs: hasKey() ? 300 : 2500 } },
    );
    const out = {} as Spot;
    for (const id of SPOT_IDS) {
      const e = json[id];
      out[id] = { usd: e?.usd ?? 0, change24h: e?.usd_24h_change ?? null };
    }
    return out;
  });
}

/**
 * USD prices for ERC-20 contracts on one chain. Cached per contract (a miss - a token CoinGecko
 * doesn't list - is cached too, so junk tokens never re-spend credits). Keyless CoinGecko allows
 * only ONE contract per request, so with no COINGECKO_API_KEY this is slow and capped; with a
 * (free Demo) key it batches 50 per call.
 */
export async function getTokenQuotes(platform: string, contracts: string[], maxLookups = 40): Promise<Record<string, Quote | null>> {
  const out: Record<string, Quote | null> = {};
  const misses: string[] = [];

  for (const raw of new Set(contracts.map((c) => c.toLowerCase()))) {
    const hit = await cacheGet<{ q: Quote | null }>(cacheKey('tokprice', platform, raw));
    if (hit) out[raw] = hit.q;
    else misses.push(raw);
  }

  const chunkSize = hasKey() ? 50 : 1;
  const todo = misses.slice(0, maxLookups);
  for (let i = 0; i < todo.length; i += chunkSize) {
    const chunk = todo.slice(i, i + chunkSize);
    let json: Record<string, { usd?: number; usd_24h_change?: number | null }> = {};
    try {
      json = await fetchJson(`${API_BASE}/simple/token_price/${platform}?contract_addresses=${chunk.join(',')}&vs_currencies=usd&include_24hr_change=true`, {
        headers: headers(),
        throttle: { key: 'coingecko', minIntervalMs: hasKey() ? 300 : 2500 },
      });
    } catch (err) {
      // a rate-limit here must not sink the whole source - the tokens just stay unpriced this round
      if (err instanceof Error && /rate limit|429/i.test(err.message)) break;
      throw err;
    }
    for (const c of chunk) {
      const e = json[c];
      const q: Quote | null = e?.usd ? { usd: e.usd, change24h: e.usd_24h_change ?? null } : null;
      out[c] = q;
      await cacheSet(cacheKey('tokprice', platform, c), { q }, TTL.tokenPrice);
    }
  }

  return out;
}
