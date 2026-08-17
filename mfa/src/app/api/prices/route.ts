import { NextResponse } from 'next/server';
import { cached, cacheKey } from '@/lib/cache';
import { CACHE_TTL_SECONDS } from '@/lib/config';
import * as coingecko from '@/lib/coingecko';
import type { ApiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface PricesResponse {
  native: coingecko.PricePoint | null;
  tokens: Record<string, coingecko.PricePoint>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeNative = searchParams.get('native') === 'true';
    const contracts = (searchParams.get('contracts') ?? '')
      .split(',')
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean);

    const [native, tokens] = await Promise.all([
      includeNative
        ? cached(cacheKey('price', 'native'), CACHE_TTL_SECONDS.currentPrice, () => coingecko.getNativeCurrentPrice())
        : Promise.resolve(null),
      contracts.length > 0
        ? cached(cacheKey('price', 'tokens', contracts.join(',')), CACHE_TTL_SECONDS.currentPrice, () =>
            coingecko.getTokenCurrentPrices(contracts),
          )
        : Promise.resolve({}),
    ]);

    return NextResponse.json({ data: { native, tokens } } satisfies ApiResult<PricesResponse>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load prices';
    return NextResponse.json({ error: message } satisfies ApiResult<PricesResponse>, { status: 502 });
  }
}
