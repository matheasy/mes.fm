import { RPC_URLS, V3_MANAGERS, type FarmConfig } from '../config';
import { SEL, decodeString, encAddr, encUint, ethCall, rpcBatch, rpcBatchDetailed, scale, signedWord, word, wordAddress, type RpcCall } from '../rpc';
import { getSpot } from '../prices';
import type { LpLeg, RawHolding } from '../types';
import { constantProductValueUsd } from './poolValue';

/**
 * EVM liquidity-pool positions, read straight from chain over keyless public RPC (JSON-RPC
 * batched, hand-rolled ABI):
 *  - Uniswap-V3-style concentrated liquidity: an ERC-721 per position (Uniswap V3, PancakeSwap V3).
 *    Token amounts come from the position's liquidity + tick range + the pool's current price;
 *    unclaimed fees from a `collect` dry-run.
 *  - Uniswap-V2-style pair tokens (UNI-V2, Cake-LP, SushiSwap LP...): an ERC-20 that is a share of
 *    the pair's two reserves.
 * Both are valued from the underlying tokens' USD prices via `priceOf`.
 */

export type EvmChain = keyof typeof RPC_URLS;
export type PriceOf = (contract: string) => Promise<{ usd: number; change24h: number | null } | null>;

const MAX_UINT128 = (1n << 128n) - 1n;
const MAX_POSITIONS_PER_HOLDER = 100;

interface TokenMeta {
  symbol: string;
  decimals: number;
}

async function tokenMeta(chain: EvmChain, addresses: string[]): Promise<Map<string, TokenMeta>> {
  const uniq = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const calls: RpcCall[] = uniq.flatMap((a) => [ethCall(a, SEL.symbol), ethCall(a, SEL.decimals)]);
  const res = await rpcBatch(RPC_URLS[chain], calls);
  const out = new Map<string, TokenMeta>();
  uniq.forEach((a, i) => {
    const decimals = word(res[i * 2 + 1] ?? null, 0);
    out.set(a, { symbol: decodeString(res[i * 2] ?? null) ?? '?', decimals: decimals === null ? 18 : Number(decimals) });
  });
  return out;
}

const compactUsd = (legs: LpLeg[]): number | null => {
  const known = legs.filter((l) => l.valueUsd !== null);
  if (known.length === 0) return null;
  return known.reduce((s, l) => s + l.valueUsd!, 0);
};

// ---- Uniswap V3 -------------------------------------------------------------------------------

/** Token amounts (as decimal-adjusted floats) held by a V3 position at the pool's current price */
export function v3Amounts(liquidity: number, tickLower: number, tickUpper: number, sqrtPriceX96: bigint, dec0: number, dec1: number): [number, number] {
  const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
  const sqrtA = Math.pow(1.0001, tickLower / 2);
  const sqrtB = Math.pow(1.0001, tickUpper / 2);
  const clamped = Math.min(Math.max(sqrtP, sqrtA), sqrtB);
  const amount0 = liquidity * (1 / clamped - 1 / sqrtB);
  const amount1 = liquidity * (clamped - sqrtA);
  return [amount0 / 10 ** dec0, amount1 / 10 ** dec1];
}

export async function detectV3Positions(chain: EvmChain, owner: string, priceOf: PriceOf): Promise<RawHolding[]> {
  const managers = V3_MANAGERS[chain] ?? [];
  if (managers.length === 0) return [];
  const urls = RPC_URLS[chain];

  // every place an owner's NFTs can sit: the manager itself (unstaked) and each farm (staked)
  const holders = managers.flatMap((manager) => [
    { manager, address: manager.address, stakedIn: null as string | null, farm: null as FarmConfig | null },
    ...(manager.farms ?? []).map((f) => ({ manager, address: f.address, stakedIn: f.name as string | null, farm: f as FarmConfig | null })),
  ]);
  const counts = await rpcBatchDetailed(urls, holders.map((h) => ethCall(h.address, SEL.balanceOf + encAddr(owner))));
  // a revert means "that farm isn't deployed here" (= 0 positions); a call with NO answer is an outage - never let that pass as "no positions"
  if (counts.some((c) => c.value === null && !c.reverted)) throw new Error(`could not read LP position balances on ${chain} (RPC failed)`);
  const rows: RawHolding[] = [];

  for (const manager of managers) {
    const mine = holders.map((h, i) => ({ ...h, count: Number(word(counts[i]?.value ?? null, 0) ?? 0n) })).filter((h) => h.manager === manager && h.count > 0);
    if (mine.length === 0) continue;

    const found: { id: bigint; stakedIn: string | null; farm: FarmConfig | null }[] = [];
    for (const h of mine) {
      const n = Math.min(h.count, MAX_POSITIONS_PER_HOLDER);
      const idRes = await rpcBatch(urls, Array.from({ length: n }, (_, i) => ethCall(h.address, SEL.tokenOfOwnerByIndex + encAddr(owner) + encUint(i))));
      for (const r of idRes) {
        const id = word(r, 0);
        if (id !== null) found.push({ id, stakedIn: h.stakedIn, farm: h.farm });
      }
    }

    const [posRes, factoryRes] = await Promise.all([
      rpcBatch(urls, found.map((f) => ethCall(manager.address, SEL.positions + encUint(f.id)))),
      rpcBatch(urls, [ethCall(manager.address, SEL.factory)]),
    ]);
    const factory = wordAddress(factoryRes[0] ?? null, 0);
    if (!factory) continue;

    interface Pos {
      id: bigint;
      stakedIn: string | null;
      farm: FarmConfig | null;
      token0: string;
      token1: string;
      fee: number;
      tickLower: number;
      tickUpper: number;
      liquidity: bigint;
      owed0: bigint;
      owed1: bigint;
    }
    const positions: Pos[] = [];
    posRes.forEach((r, i) => {
      const token0 = wordAddress(r, 2);
      const token1 = wordAddress(r, 3);
      const fee = word(r, 4);
      const tl = signedWord(r, 5);
      const tu = signedWord(r, 6);
      const liquidity = word(r, 7);
      if (!token0 || !token1 || fee === null || tl === null || tu === null || liquidity === null) return;
      const owed0 = word(r, 10) ?? 0n;
      const owed1 = word(r, 11) ?? 0n;
      // wallets accumulate dead/airdropped position NFTs - don't spend calls on empty ones
      if (liquidity === 0n && owed0 === 0n && owed1 === 0n) return;
      positions.push({ id: found[i]!.id, stakedIn: found[i]!.stakedIn, farm: found[i]!.farm, token0, token1, fee: Number(fee), tickLower: Number(tl), tickUpper: Number(tu), liquidity, owed0, owed1 });
    });
    if (positions.length === 0) continue;

    const [poolRes, collectRes, meta] = await Promise.all([
      rpcBatch(urls, positions.map((p) => ethCall(factory, SEL.getPool + encAddr(p.token0) + encAddr(p.token1) + encUint(p.fee)))),
      // dry-run `collect` from the owner: the fees actually claimable right now (reverts for staked NFTs - then tokensOwed is used)
      rpcBatch(
        urls,
        positions.map((p) => ({
          method: 'eth_call',
          params: [{ from: owner, to: manager.address, data: '0xfc6f7865' + encUint(p.id) + encAddr(owner) + encUint(MAX_UINT128) + encUint(MAX_UINT128) }, 'latest'],
        })),
      ),
      tokenMeta(chain, positions.flatMap((p) => [p.token0, p.token1])),
    ]);

    const pools = poolRes.map((r) => wordAddress(r, 0));
    const slotRes = await rpcBatch(urls, pools.map((p) => ethCall(p ?? '0x0000000000000000000000000000000000000000', SEL.slot0)));

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      const sqrtPriceX96 = word(slotRes[i] ?? null, 0);
      if (sqrtPriceX96 === null || sqrtPriceX96 === 0n) continue;

      const m0 = meta.get(p.token0.toLowerCase())!;
      const m1 = meta.get(p.token1.toLowerCase())!;
      let [a0, a1] = v3Amounts(Number(p.liquidity), p.tickLower, p.tickUpper, sqrtPriceX96, m0.decimals, m1.decimals);

      const fee0 = word(collectRes[i] ?? null, 0);
      const fee1 = word(collectRes[i] ?? null, 1);
      const unclaimed0 = scale(fee0 ?? p.owed0, m0.decimals);
      const unclaimed1 = scale(fee1 ?? p.owed1, m1.decimals);
      if (a0 + a1 + unclaimed0 + unclaimed1 <= 0) continue;
      a0 += unclaimed0;
      a1 += unclaimed1;

      const [q0, q1] = await Promise.all([priceOf(p.token0), priceOf(p.token1)]);
      const legs: LpLeg[] = [
        { symbol: m0.symbol, amount: a0, valueUsd: q0 ? a0 * q0.usd : null },
        { symbol: m1.symbol, amount: a1, valueUsd: q1 ? a1 * q1.usd : null },
      ];
      const valueUsd = compactUsd(legs);
      if (valueUsd === null) continue;

      const sqrtP = Number(sqrtPriceX96) / 2 ** 96;
      const inRange = sqrtP >= Math.pow(1.0001, p.tickLower / 2) && sqrtP <= Math.pow(1.0001, p.tickUpper / 2);
      const poolName = `${m0.symbol}/${m1.symbol}`;
      rows.push({
        symbol: poolName,
        kind: 'lp',
        label: `${manager.name} ${poolName} ${p.fee / 10000}%`,
        contract: manager.address,
        amount: 1,
        priceUsd: null,
        valueUsd,
        change24hPct: null,
        detail: [
          `position #${p.id}`,
          inRange ? 'in range' : 'OUT OF RANGE',
          p.stakedIn ? `staked in ${p.stakedIn}` : null,
          !p.stakedIn && unclaimed0 + unclaimed1 > 0 ? 'includes unclaimed fees' : null,
        ]
          .filter(Boolean)
          .join(' · '),
        lp: { pool: `${manager.name} ${poolName}`, share: null, legs },
      });
    }

    // unharvested farm rewards (e.g. CAKE) of the staked positions
    const stakedByFarm = new Map<string, { farm: FarmConfig; ids: bigint[] }>();
    for (const p of positions) {
      if (!p.farm?.pendingSelector) continue;
      const g = stakedByFarm.get(p.farm.address) ?? { farm: p.farm, ids: [] };
      g.ids.push(p.id);
      stakedByFarm.set(p.farm.address, g);
    }
    for (const { farm, ids } of stakedByFarm.values()) {
      const token = farm.rewardToken?.[chain];
      if (!token) continue;
      const res = await rpcBatch(urls, ids.map((id) => ethCall(farm.address, farm.pendingSelector! + encUint(id))));
      const pending = res.reduce((sum, r) => sum + (word(r, 0) ?? 0n), 0n);
      const amount = scale(pending, 18);
      const spot = amount > 0 ? await getSpot() : null;
      const spotQuote = spot && farm.rewardCoingeckoId ? (spot as Record<string, { usd: number; change24h: number | null }>)[farm.rewardCoingeckoId] : undefined;
      const q = amount > 0 ? (spotQuote?.usd ? spotQuote : await priceOf(token)) : null;
      if (q && amount * q.usd > 0) {
        rows.push({
          symbol: farm.rewardSymbol ?? 'REWARD',
          kind: 'reward',
          label: `${farm.name} rewards (${farm.rewardSymbol ?? 'reward'})`,
          contract: token,
          amount,
          priceUsd: q.usd,
          valueUsd: amount * q.usd,
          change24hPct: q.change24h,
          detail: `unharvested, from staked position${ids.length > 1 ? 's' : ''} ${ids.map((i) => '#' + i).join(', ')}`,
        });
      }
    }
  }

  return rows;
}

// ---- Uniswap V2 -------------------------------------------------------------------------------

export async function detectV2Lp(
  chain: EvmChain,
  pair: { address: string; balance: bigint; decimals: number; symbol: string },
  priceOf: PriceOf,
): Promise<RawHolding | null> {
  const urls = RPC_URLS[chain];
  const a = pair.address;
  const res = await rpcBatch(urls, [ethCall(a, SEL.token0), ethCall(a, SEL.token1), ethCall(a, SEL.getReserves), ethCall(a, SEL.totalSupply)]);

  const token0 = wordAddress(res[0] ?? null, 0);
  const token1 = wordAddress(res[1] ?? null, 0);
  const r0 = word(res[2] ?? null, 0);
  const r1 = word(res[2] ?? null, 1);
  const supply = word(res[3] ?? null, 0);
  if (!token0 || !token1 || r0 === null || r1 === null || !supply || supply === 0n) return null;

  const meta = await tokenMeta(chain, [token0, token1]);
  const m0 = meta.get(token0.toLowerCase())!;
  const m1 = meta.get(token1.toLowerCase())!;

  const share = Number(pair.balance) / Number(supply);
  const legs: LpLeg[] = [
    { symbol: m0.symbol, amount: share * scale(r0, m0.decimals), valueUsd: null },
    { symbol: m1.symbol, amount: share * scale(r1, m1.decimals), valueUsd: null },
  ];
  const [q0, q1] = await Promise.all([priceOf(token0), priceOf(token1)]);
  legs[0]!.valueUsd = q0 ? legs[0]!.amount * q0.usd : null;
  legs[1]!.valueUsd = q1 ? legs[1]!.amount * q1.usd : null;

  // constant-product pair: both sides carry equal value, so one priced side prices the position
  const valueUsd = constantProductValueUsd(legs, () => false);
  if (valueUsd === null) return null;

  const poolName = `${m0.symbol}/${m1.symbol}`;
  return {
    symbol: poolName,
    kind: 'lp',
    label: `${pair.symbol} ${poolName}`,
    contract: pair.address,
    amount: scale(pair.balance, pair.decimals),
    priceUsd: null,
    valueUsd,
    change24hPct: null,
    detail: `${(share * 100).toFixed(4)}% of the pair`,
    lp: { pool: poolName, share, legs },
  };
}

/** Symbols/names that make an unpriced ERC-20 worth probing as a V2-style LP token */
export const LP_NAME_HINT = /\b(LP|SLP|UNI-V2|CAKE-LP|PGL|JLP|BPT)\b|-LP$|V2$|LIQUIDITY/i;
