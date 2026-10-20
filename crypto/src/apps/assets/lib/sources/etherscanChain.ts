import { BLOCKSCOUT_CHAINS, FETCH_FLOOR_USD, RPC_URLS, V3_MANAGERS, chainHasV3Farms } from '../config';
import { fetchJson } from '../http';
import { getSpot, type Quote } from '../prices';
import { SEL, encAddr, ethCall, rpcBatch, rpcOne, scale } from '../rpc';
import type { RawHolding, SourceResult } from '../types';
import { LP_NAME_HINT, detectV2Lp, detectV3Positions } from './lp';
import { makePriceOf } from './priceOf';
import { wellKnownUsd } from './wellKnown';

/**
 * Arbitrum, Polygon and Base balances without Blockscout: since 2026-10 those Blockscout instances put
 * a Cloudflare "Just a moment..." check in front of their API, so a server can't read them (Ethereum's
 * and Optimism's still answer and keep using sources/blockscout.ts). Instead:
 *  - native coin: eth_getBalance on the public RPCs (no key),
 *  - which tokens: every ERC-20 the address ever received or sent, from Etherscan V2's `tokentx`
 *    (the ETHERSCAN_API_KEY the AI / Main wallet history already uses),
 *  - exact balances: `balanceOf` on each of them (one RPC batch),
 *  - prices: DefiLlama current prices (keyless), only with confidence >= 0.9 - so scam airdrops, which
 *    have no real market, drop out on their own - plus the well-known stablecoins / wrapped coins.
 * If Etherscan won't list the tokens (no key, or a chain its free plan doesn't cover), the native coin
 * is still reported, with a note.
 */

type Chain = 'arbitrum' | 'polygon' | 'base';
const ETHERSCAN = 'https://api.etherscan.io/v2/api';
const MAX_TOKENS = 150;

interface TokenTx {
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: string;
}

async function etherscanList<T>(chainId: number, params: Record<string, string>): Promise<T[]> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) throw new Error('ETHERSCAN_API_KEY is not set');
  const qs = new URLSearchParams({ chainid: String(chainId), apikey: key, ...params });
  const json = await fetchJson<{ status: string; message: string; result: T[] | string }>(`${ETHERSCAN}?${qs}`, {
    throttle: { key: 'etherscan', minIntervalMs: 250 },
  });
  if (Array.isArray(json.result)) return json.result;
  if (/no transactions found/i.test(json.message) || /no transactions found/i.test(String(json.result))) return [];
  throw new Error(`Etherscan: ${typeof json.result === 'string' ? json.result : json.message}`);
}

async function llamaQuotes(chain: Chain, contracts: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  for (let i = 0; i < contracts.length; i += 60) {
    const keys = contracts.slice(i, i + 60).map((c) => `${chain}:${c}`);
    const [prices, changes] = await Promise.all([
      fetchJson<{ coins: Record<string, { price?: number; confidence?: number }> }>(`https://coins.llama.fi/prices/current/${keys.join(',')}?searchWidth=6h`).catch(
        () => ({ coins: {} as Record<string, { price?: number; confidence?: number }> }),
      ),
      fetchJson<{ coins: Record<string, number> }>(`https://coins.llama.fi/percentage/${keys.join(',')}?period=24h`).catch(() => ({ coins: {} as Record<string, number> })),
    ]);
    for (const k of keys) {
      const p = prices.coins[k];
      if (p?.price && (p.confidence ?? 0) >= 0.9) out.set(k.slice(chain.length + 1), { usd: p.price, change24h: Number.isFinite(changes.coins[k]) ? changes.coins[k]! : null });
    }
  }
  return out;
}

export async function fetchEtherscanChain(chain: Chain, address: string): Promise<SourceResult> {
  const cfg = BLOCKSCOUT_CHAINS[chain];
  const urls = RPC_URLS[chain];
  const spot = await getSpot();
  const rows: RawHolding[] = [];
  let note: string | undefined;

  // ---- native coin ----
  const balHex = await rpcOne(urls, { method: 'eth_getBalance', params: [address, 'latest'] });
  if (balHex === null) throw new Error(`no ${chain} RPC answered`);
  const nativeAmount = scale(BigInt(balHex), 18);
  const nativeQuote = cfg.nativeSymbol === 'POL' ? spot['polygon-ecosystem-token'] : spot.ethereum;
  if (nativeAmount > 0 && nativeAmount * nativeQuote.usd >= FETCH_FLOOR_USD) {
    rows.push({
      symbol: cfg.nativeSymbol,
      kind: 'token',
      label: `${cfg.nativeSymbol} (native)`,
      amount: nativeAmount,
      priceUsd: nativeQuote.usd,
      valueUsd: nativeAmount * nativeQuote.usd,
      change24hPct: nativeQuote.change24h,
    });
  }

  // ---- which tokens ----
  let txs: TokenTx[] = [];
  let hasV3Position = false;
  try {
    txs = await etherscanList<TokenTx>(cfg.chainId, { module: 'account', action: 'tokentx', address, page: '1', offset: '10000', sort: 'desc' });
    const managers = new Set((V3_MANAGERS[chain] ?? []).map((m) => m.address));
    if (managers.size) {
      const nfts = await etherscanList<{ contractAddress: string }>(cfg.chainId, { module: 'account', action: 'tokennfttx', address, page: '1', offset: '1000', sort: 'desc' }).catch(() => []);
      hasV3Position = nfts.some((n) => managers.has(n.contractAddress.toLowerCase()));
    }
  } catch (err) {
    note = `${err instanceof Error ? err.message : 'Etherscan did not answer'} - only the native coin is shown`;
  }

  const tokens = new Map<string, { symbol: string; name: string; decimals: number }>();
  for (const t of txs) {
    const c = t.contractAddress.toLowerCase();
    const d = Number(t.tokenDecimal);
    if (!tokens.has(c) && Number.isFinite(d)) tokens.set(c, { symbol: t.tokenSymbol || '?', name: t.tokenName || '', decimals: d });
  }
  const list = [...tokens.entries()].slice(0, MAX_TOKENS);

  // ---- exact balances ----
  const balances = await rpcBatch(
    urls,
    list.map(([c]) => ethCall(c, SEL.balanceOf + encAddr(address))),
  );
  const held = list
    .map(([c, info], i) => ({ c, ...info, raw: balances[i] ? BigInt(balances[i]!.slice(0, 66)) : 0n }))
    .filter((t) => t.raw > 0n);

  // ---- prices ----
  const quotes = await llamaQuotes(chain, held.map((t) => t.c));
  const known = new Map<string, Quote>();
  const lpCandidates: { address: string; symbol: string; decimals: number; balance: bigint }[] = [];
  for (const t of held) {
    const q = quotes.get(t.c) ?? wellKnownUsd(chain, t.c, spot);
    const amount = scale(t.raw, t.decimals);
    if (q) {
      known.set(t.c, q);
      const valueUsd = amount * q.usd;
      if (valueUsd >= FETCH_FLOOR_USD && Number.isFinite(valueUsd)) {
        rows.push({ symbol: t.symbol, kind: 'token', contract: t.c, amount, priceUsd: q.usd, valueUsd, change24hPct: q.change24h });
      }
    } else if (LP_NAME_HINT.test(`${t.symbol} ${t.name}`)) {
      lpCandidates.push({ address: t.c, symbol: t.symbol, decimals: t.decimals, balance: t.raw });
    }
  }

  // ---- liquidity pools (as sources/blockscout.ts) ----
  if (hasV3Position || lpCandidates.length > 0 || chainHasV3Farms(chain)) {
    const priceOf = makePriceOf(chain, cfg.coingeckoPlatform, known);
    if (hasV3Position || chainHasV3Farms(chain)) rows.push(...(await detectV3Positions(chain, address, priceOf)));
    for (const c of lpCandidates.slice(0, 10)) {
      const lp = await detectV2Lp(chain, c, priceOf);
      if (lp && (lp.valueUsd ?? 0) >= FETCH_FLOOR_USD) rows.push(lp);
    }
  }

  return { holdings: rows, ...(note ? { note } : {}) };
}
