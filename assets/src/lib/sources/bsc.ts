import { FETCH_FLOOR_USD, PINNED_BSC_TOKENS, RPC_URLS, TTL } from '../config';
import { cached, cacheKey } from '../cache';
import { RateLimitError } from '../errors';
import { fetchJson } from '../http';
import { getSpot, getTokenQuotes } from '../prices';
import { SEL, encAddr, ethCall, rpcBatch, scale, word } from '../rpc';
import type { RawHolding, SourceResult } from '../types';
import { LP_NAME_HINT, detectV2Lp, detectV3Positions } from './lp';
import { makePriceOf } from './priceOf';

/**
 * BNB Chain. No keyless indexer exists for it, so it is the one chain that uses a key:
 *  1. DISCOVERY (NodeReal `nr_getAssetTransfers`, received BEP-20s only): which token contracts
 *     the wallet has ever received. Costs NodeReal credits, so it is cached for 12h and is NOT
 *     dropped by the Refresh button.
 *  2. BALANCES (public RPC, one JSON-RPC batch of `balanceOf` + native): exact current amounts -
 *     right even for rebasing/fee-on-transfer tokens, unlike summing transfer history.
 *  3. PRICES (CoinGecko by contract), then LP detection for pair tokens + PancakeSwap V3 NFTs.
 */

const NODEREAL = 'https://bsc-mainnet.nodereal.io/v1';

interface Discovered {
  address: string;
  symbol: string;
  decimals: number | null;
}

interface NrTransfer {
  asset: string | null;
  rawContract: { address: string | null; decimal: string | null } | null;
}

async function discoverTokens(wallet: string): Promise<Discovered[]> {
  const key = process.env.NODEREAL_API_KEY;
  if (!key) throw new Error('NODEREAL_API_KEY is not set');

  const found = new Map<string, Discovered>();
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const res = await fetchJson<{ result?: { transfers: NrTransfer[]; pageToken?: string }; error?: { message: string } }>(`${NODEREAL}/${key}`, {
      method: 'POST',
      body: {
        jsonrpc: '2.0',
        id: page,
        method: 'nr_getAssetTransfers',
        params: [{ toAddress: wallet, category: ['20'], withMetadata: true, excludeZeroValue: false, pageSize: 100, pageToken }],
      },
      throttle: { key: 'nodereal', minIntervalMs: 500 },
    });
    if (res.error) {
      if (/rate limit|too many/i.test(res.error.message)) throw new RateLimitError('NodeReal rate limit reached');
      throw new Error(`NodeReal error: ${res.error.message}`);
    }
    const transfers = res.result?.transfers;
    if (!Array.isArray(transfers)) throw new Error('NodeReal nr_getAssetTransfers returned an unexpected response shape');

    for (const t of transfers) {
      const addr = t.rawContract?.address?.toLowerCase();
      if (!addr || found.has(addr)) continue;
      const dec = t.rawContract?.decimal;
      found.set(addr, { address: addr, symbol: t.asset ?? '?', decimals: dec ? (dec.startsWith('0x') ? parseInt(dec, 16) : Number(dec)) : null });
    }
    if (!res.result?.pageToken || transfers.length < 100) break;
    pageToken = res.result.pageToken;
  }
  return [...found.values()];
}

export async function fetchBsc(wallet: string): Promise<SourceResult> {
  const urls = RPC_URLS.bsc;
  const spot = await getSpot();
  const rows: RawHolding[] = [];
  let note: string | undefined;

  // 1. discovery (long cache)
  let tokens: Discovered[] = [];
  if (process.env.NODEREAL_API_KEY) {
    tokens = await cached(cacheKey('discovery', 'bsc', wallet), TTL.bscDiscovery, () => discoverTokens(wallet));
  } else {
    note = 'NODEREAL_API_KEY not set - BNB Chain tokens were not scanned (native BNB and PancakeSwap V3 positions still are)';
  }
  // always balance-check the pinned list too - covers holdings NodeReal's discovery lookback misses
  for (const p of PINNED_BSC_TOKENS) {
    if (!tokens.some((t) => t.address === p.address)) tokens.push({ address: p.address, symbol: p.symbol, decimals: p.decimals });
  }

  // 2. exact balances in one batch: native BNB, then balanceOf per token (+ decimals when discovery didn't carry it)
  const needDecimals = tokens.filter((t) => t.decimals === null);
  const res = await rpcBatch(urls, [
    { method: 'eth_getBalance', params: [wallet, 'latest'] },
    ...tokens.map((t) => ethCall(t.address, SEL.balanceOf + encAddr(wallet))),
    ...needDecimals.map((t) => ethCall(t.address, SEL.decimals)),
  ]);

  const bnb = scale(BigInt(res[0] ?? '0x0'), 18);
  if (bnb * spot.binancecoin.usd >= FETCH_FLOOR_USD) {
    rows.push({ symbol: 'BNB', kind: 'token', label: 'BNB (native)', amount: bnb, priceUsd: spot.binancecoin.usd, valueUsd: bnb * spot.binancecoin.usd, change24hPct: spot.binancecoin.change24h });
  }

  const decimalsByAddr = new Map<string, number>();
  needDecimals.forEach((t, i) => {
    const d = word(res[1 + tokens.length + i] ?? null, 0);
    if (d !== null) decimalsByAddr.set(t.address, Number(d));
  });

  const held = tokens
    .map((t, i) => ({ ...t, decimals: t.decimals ?? decimalsByAddr.get(t.address) ?? 18, balance: word(res[1 + i] ?? null, 0) ?? 0n }))
    .filter((t) => t.balance > 0n);

  // 3. prices for what is actually held
  const quotes = held.length > 0 ? await getTokenQuotes('binance-smart-chain', held.map((t) => t.address)) : {};
  const known = new Map<string, { usd: number; change24h: number | null }>();
  const lpCandidates: typeof held = [];

  for (const t of held) {
    const q = quotes[t.address];
    if (q) {
      known.set(t.address, q);
      const amount = scale(t.balance, t.decimals);
      const valueUsd = amount * q.usd;
      if (valueUsd >= FETCH_FLOOR_USD && Number.isFinite(valueUsd)) {
        rows.push({ symbol: t.symbol, kind: 'token', contract: t.address, amount, priceUsd: q.usd, valueUsd, change24hPct: q.change24h });
      }
    } else if (LP_NAME_HINT.test(t.symbol)) {
      lpCandidates.push(t);
    }
  }

  // 4. liquidity pools
  const priceOf = makePriceOf('bsc', 'binance-smart-chain', known);
  rows.push(...(await detectV3Positions('bsc', wallet, priceOf)));
  for (const c of lpCandidates.slice(0, 10)) {
    const lp = await detectV2Lp('bsc', { address: c.address, balance: c.balance, decimals: c.decimals, symbol: c.symbol }, priceOf);
    if (lp && (lp.valueUsd ?? 0) >= FETCH_FLOOR_USD) rows.push(lp);
  }

  return { holdings: rows, note };
}
