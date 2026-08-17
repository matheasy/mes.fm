const API_BASE = 'https://api.coingecko.com/api/v3';
const CHAIN_PLATFORM = 'binance-smart-chain';

function headers(): HeadersInit {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

async function get<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: headers(), next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface PricePoint {
  usd: number;
  usd24hChange: number | null;
}

/** Current USD price + 24h change for the native coin (BNB) */
export async function getNativeCurrentPrice(): Promise<PricePoint> {
  const result = await get<Record<string, { usd: number; usd_24h_change?: number }>>('/simple/price', {
    ids: 'binancecoin',
    vs_currencies: 'usd',
    include_24hr_change: 'true',
  });
  const entry = result.binancecoin;
  return { usd: entry?.usd ?? 0, usd24hChange: entry?.usd_24h_change ?? null };
}

/** Current USD price + 24h change for BEP-20 tokens, batched by contract address */
export async function getTokenCurrentPrices(contractAddresses: string[]): Promise<Record<string, PricePoint>> {
  if (contractAddresses.length === 0) return {};

  const result = await get<Record<string, { usd?: number; usd_24h_change?: number }>>(
    `/simple/token_price/${CHAIN_PLATFORM}`,
    {
      contract_addresses: contractAddresses.map((a) => a.toLowerCase()).join(','),
      vs_currencies: 'usd',
      include_24hr_change: 'true',
    },
  );

  const out: Record<string, PricePoint> = {};
  for (const [contract, entry] of Object.entries(result)) {
    out[contract.toLowerCase()] = { usd: entry.usd ?? 0, usd24hChange: entry.usd_24h_change ?? null };
  }
  return out;
}

/** Resolves a BEP-20 contract address to its CoinGecko coin id, or null if CoinGecko doesn't list it */
export async function resolveCoinIdByContract(contractAddress: string): Promise<string | null> {
  try {
    const result = await get<{ id: string }>(`/coins/${CHAIN_PLATFORM}/contract/${contractAddress.toLowerCase()}`, {});
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

/** Historical USD price for a coin at a given date (day granularity, as CoinGecko's free tier provides) */
export async function getHistoricalPrice(coinId: string, date: Date): Promise<number | null> {
  const result = await get<{ market_data?: { current_price?: { usd?: number } } }>(`/coins/${coinId}/history`, {
    date: toCoingeckoDate(date),
    localization: 'false',
  });
  return result.market_data?.current_price?.usd ?? null;
}
