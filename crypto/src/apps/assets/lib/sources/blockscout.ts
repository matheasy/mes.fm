import { BLOCKSCOUT_CHAINS, FETCH_FLOOR_USD, V3_MANAGERS, chainHasV3Farms, type BlockscoutChain } from '../config';
import { fetchJson } from '../http';
import { getSpot } from '../prices';
import { scale } from '../rpc';
import type { RawHolding, SourceResult } from '../types';
import { LP_NAME_HINT, detectV2Lp, detectV3Positions } from './lp';
import { makePriceOf } from './priceOf';

/**
 * EVM chains that have a public Blockscout indexer (Ethereum, Arbitrum, Polygon, Base, Optimism).
 * Keyless, and - the reason it's the backbone here - `token-balances` returns every token the
 * address holds WITH a USD `exchange_rate`, so one call per wallet per chain replaces the
 * history-scan + per-token price lookups the older trackers do. Spam tokens have no rate (or are
 * flagged `reputation: scam`) and drop out on their own.
 */

interface BsAddress {
  coin_balance: string | null;
  exchange_rate: string | null;
}

interface BsTokenBalance {
  value: string;
  token: {
    address_hash?: string;
    address?: string;
    name: string | null;
    symbol: string | null;
    decimals: string | null;
    type: string;
    exchange_rate: string | null;
    reputation?: string | null;
  };
}

const num = (s: string | null | undefined): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const bs = <T,>(host: string, path: string) =>
  fetchJson<T>(`https://${host}${path}`, { throttle: { key: `blockscout:${host}`, minIntervalMs: 300 } });

export async function fetchBlockscoutChain(chain: BlockscoutChain['id'], address: string): Promise<SourceResult> {
  const cfg = BLOCKSCOUT_CHAINS[chain];
  const spot = await getSpot();

  let info: BsAddress | null = null;
  let tokens: BsTokenBalance[] = [];
  try {
    [info, tokens] = await Promise.all([
      bs<BsAddress>(cfg.host, `/api/v2/addresses/${address}`),
      bs<BsTokenBalance[]>(cfg.host, `/api/v2/addresses/${address}/token-balances`),
    ]);
  } catch (err) {
    // an address that has never touched this chain is a 404, i.e. simply empty
    if (err instanceof Error && / 404$/.test(err.message)) return { holdings: [] };
    throw err;
  }

  const rows: RawHolding[] = [];

  // ---- native coin ----
  const nativeAmount = scale(BigInt(info?.coin_balance ?? '0'), 18);
  const nativeFallback = cfg.nativeSymbol === 'POL' ? spot['polygon-ecosystem-token'].usd : spot.ethereum.usd;
  const nativePrice = num(info?.exchange_rate) || nativeFallback;
  if (nativeAmount > 0 && nativeAmount * nativePrice >= FETCH_FLOOR_USD) {
    rows.push({
      symbol: cfg.nativeSymbol,
      kind: 'token',
      label: `${cfg.nativeSymbol} (native)`,
      amount: nativeAmount,
      priceUsd: nativePrice,
      valueUsd: nativeAmount * nativePrice,
      change24hPct: cfg.nativeSymbol === 'POL' ? spot['polygon-ecosystem-token'].change24h : spot.ethereum.change24h,
    });
  }

  // ---- ERC-20s (Blockscout already prices them) ----
  const known = new Map<string, { usd: number; change24h: number | null }>();
  const lpCandidates: { address: string; symbol: string; decimals: number; balance: bigint }[] = [];
  let hasV3Position = false;
  const managerAddrs = new Set((V3_MANAGERS[chain] ?? []).map((m) => m.address));

  for (const t of tokens) {
    const contract = (t.token.address_hash ?? t.token.address ?? '').toLowerCase();
    if (!contract) continue;

    if (t.token.type !== 'ERC-20') {
      if (managerAddrs.has(contract)) hasV3Position = true;
      continue;
    }
    if (t.token.reputation === 'scam') continue;

    const decimals = t.token.decimals === null || t.token.decimals === undefined ? null : Number(t.token.decimals);
    if (decimals === null || !Number.isFinite(decimals)) continue;

    let raw: bigint;
    try {
      raw = BigInt(t.value);
    } catch {
      continue;
    }
    const amount = scale(raw, decimals);
    if (amount <= 0) continue;

    const rate = num(t.token.exchange_rate);
    if (rate > 0) {
      known.set(contract, { usd: rate, change24h: null });
      const valueUsd = amount * rate;
      if (valueUsd >= FETCH_FLOOR_USD && Number.isFinite(valueUsd)) {
        rows.push({ symbol: t.token.symbol ?? '?', kind: 'token', contract, amount, priceUsd: rate, valueUsd, change24hPct: null });
      }
    } else if (LP_NAME_HINT.test(`${t.token.symbol ?? ''} ${t.token.name ?? ''}`)) {
      lpCandidates.push({ address: contract, symbol: t.token.symbol ?? 'LP', decimals, balance: raw });
    }
  }

  // ---- liquidity pools (only probed when the wallet shows signs of one) ----
  // a farm-staked NFT is not in the wallet's token list, so chains with farms are always probed
  if (hasV3Position || lpCandidates.length > 0 || chainHasV3Farms(chain)) {
    const priceOf = makePriceOf(chain, cfg.coingeckoPlatform, known);

    if (hasV3Position || chainHasV3Farms(chain)) rows.push(...(await detectV3Positions(chain, address, priceOf)));
    for (const c of lpCandidates.slice(0, 10)) {
      const lp = await detectV2Lp(chain, c, priceOf);
      if (lp && (lp.valueUsd ?? 0) >= FETCH_FLOOR_USD) rows.push(lp);
    }
  }

  return { holdings: rows };
}
