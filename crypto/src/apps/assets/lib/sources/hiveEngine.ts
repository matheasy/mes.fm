import { FETCH_FLOOR_USD, HIVE_ACCOUNT, HIVE_ENGINE_RPC } from '../config';
import { fetchJson } from '../http';
import { getSpot } from '../prices';
import type { LpLeg, RawHolding, SourceResult } from '../types';
import { constantProductValueUsd } from './poolValue';

/**
 * Hive Engine (Hive layer 2 - what hive-engine.com/@mes/wallet shows): every token balance
 * (liquid + staked + unstaking), priced from the Hive Engine internal market in HIVE, plus
 * liquidity-pool positions from the `marketpools` contract. Keyless.
 *
 * A wallet like @mes holds ~140 tokens, almost all dust, so this ONE call for balances + ONE
 * batched call for market metrics replaces per-token lookups.
 */

async function heFind<T>(contract: string, table: string, query: Record<string, unknown>, limit = 1000, offset = 0): Promise<T[]> {
  const res = await fetchJson<{ result?: T[]; error?: { message: string } }>(`${HIVE_ENGINE_RPC}/contracts`, {
    method: 'POST',
    body: { jsonrpc: '2.0', id: 1, method: 'find', params: { contract, table, query, limit, offset, indexes: [] } },
    throttle: { key: 'hive-engine', minIntervalMs: 250 },
  });
  if (res.error) throw new Error(`Hive Engine error: ${res.error.message}`);
  return res.result ?? [];
}

async function heFindAll<T>(contract: string, table: string, query: Record<string, unknown>): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const page = await heFind<T>(contract, table, query, 1000, offset);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

interface HeBalance {
  symbol: string;
  balance: string;
  stake: string;
  pendingUnstake: string;
  delegationsOut: string;
}

interface HeMetrics {
  symbol: string;
  lastPrice: string;
  highestBid: string;
  lowestAsk: string;
  priceChangePercent: string;
}

/** HIVE per 1 token, from the internal market. `thin` when the best bid is far below the last trade. */
export interface HePrice {
  hive: number;
  thin: boolean;
  change24hPct: number | null;
}

const num = (s: string | number | undefined): number => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** Market prices (in HIVE) for a set of symbols - one batched query per 100 symbols */
export async function fetchHePrices(symbols: string[]): Promise<Record<string, HePrice>> {
  const out: Record<string, HePrice> = {};
  const want = [...new Set(symbols)].filter((s) => s !== 'SWAP.HIVE' && s !== 'SWAP.HBD');

  for (let i = 0; i < want.length; i += 100) {
    const rows = await heFind<HeMetrics>('market', 'metrics', { symbol: { $in: want.slice(i, i + 100) } });
    for (const m of rows) {
      const last = num(m.lastPrice);
      if (last <= 0) continue;
      const bid = num(m.highestBid);
      out[m.symbol] = {
        hive: last,
        thin: bid < last * 0.25,
        change24hPct: m.priceChangePercent ? Number.parseFloat(m.priceChangePercent) : null,
      };
    }
  }
  return out;
}

interface HeLpPosition {
  tokenPair: string;
  shares: string;
}

interface HePool {
  tokenPair: string;
  baseQuantity: string;
  quoteQuantity: string;
  totalShares: string;
}

export async function fetchHiveEngine(account = HIVE_ACCOUNT): Promise<SourceResult> {
  const [balances, positions, spot] = await Promise.all([
    heFindAll<HeBalance>('tokens', 'balances', { account }),
    heFindAll<HeLpPosition>('marketpools', 'liquidityPositions', { account }),
    getSpot(),
  ]);

  const hiveUsd = spot.hive.usd;
  const hbdUsd = spot.hive_dollar.usd;

  const owned = balances
    .map((b) => ({
      symbol: b.symbol,
      liquid: num(b.balance),
      staked: num(b.stake),
      unstaking: num(b.pendingUnstake),
      delegatedOut: num(b.delegationsOut),
    }))
    .filter((b) => b.liquid + b.staked + b.unstaking > 0);

  const lpSymbols = positions.flatMap((p) => p.tokenPair.split(':'));
  const prices = await fetchHePrices([...owned.map((o) => o.symbol), ...lpSymbols]);

  /** USD price of one token, or null if it has no market */
  const usdPrice = (symbol: string): { usd: number; thin: boolean; change: number | null } | null => {
    if (symbol === 'SWAP.HIVE') return { usd: hiveUsd, thin: false, change: spot.hive.change24h };
    if (symbol === 'SWAP.HBD') return { usd: hbdUsd, thin: false, change: spot.hive_dollar.change24h };
    const p = prices[symbol];
    return p ? { usd: p.hive * hiveUsd, thin: p.thin, change: p.change24hPct } : null;
  };

  const rows: RawHolding[] = [];

  for (const o of owned) {
    const price = usdPrice(o.symbol);
    if (!price) continue;
    const total = o.liquid + o.staked + o.unstaking;
    const valueUsd = total * price.usd;
    if (valueUsd < FETCH_FLOOR_USD) continue;

    const parts = [
      o.liquid > 0 ? `liquid ${o.liquid.toLocaleString('en-US', { maximumFractionDigits: 4 })}` : '',
      o.staked > 0 ? `staked ${o.staked.toLocaleString('en-US', { maximumFractionDigits: 4 })}` : '',
      o.unstaking > 0 ? `unstaking ${o.unstaking.toLocaleString('en-US', { maximumFractionDigits: 4 })}` : '',
      o.delegatedOut > 0 ? `${o.delegatedOut.toLocaleString('en-US', { maximumFractionDigits: 4 })} of the stake delegated out` : '',
    ].filter(Boolean);

    rows.push({
      symbol: o.symbol,
      kind: o.liquid === 0 && o.staked + o.unstaking > 0 ? 'staked' : 'token',
      amount: total,
      priceUsd: price.usd,
      valueUsd,
      change24hPct: price.change,
      detail: parts.join(' · '),
      thin: price.thin || undefined,
    });
  }

  // ---- liquidity pools ----
  if (positions.length > 0) {
    const pools = await heFindAll<HePool>('marketpools', 'pools', { tokenPair: { $in: positions.map((p) => p.tokenPair) } });
    const poolByPair = new Map(pools.map((p) => [p.tokenPair, p]));

    for (const pos of positions) {
      const pool = poolByPair.get(pos.tokenPair);
      if (!pool) continue;
      const totalShares = num(pool.totalShares);
      const share = totalShares > 0 ? num(pos.shares) / totalShares : 0;
      if (share <= 0) continue;

      const [baseSym, quoteSym] = pos.tokenPair.split(':') as [string, string];
      const legAmounts: [string, number][] = [
        [baseSym, share * num(pool.baseQuantity)],
        [quoteSym, share * num(pool.quoteQuantity)],
      ];
      const legs: LpLeg[] = legAmounts.map(([symbol, amount]) => {
        const p = usdPrice(symbol);
        return { symbol, amount, valueUsd: p ? amount * p.usd : null };
      });

      // constant-product pool: value it off a trusted (CoinGecko-priced) leg when there is one
      const valueUsd = constantProductValueUsd(legs, (sym) => sym === 'SWAP.HIVE' || sym === 'SWAP.HBD');
      if (valueUsd === null || valueUsd < FETCH_FLOOR_USD) continue;

      rows.push({
        symbol: `${baseSym}/${quoteSym}`,
        kind: 'lp',
        label: `${baseSym}/${quoteSym} pool`,
        amount: num(pos.shares),
        priceUsd: null,
        valueUsd,
        change24hPct: null,
        detail: `${(share * 100).toFixed(4)}% of the pool`,
        lp: { pool: `${baseSym}/${quoteSym}`, share, legs },
      });
    }
  }

  return { holdings: rows };
}
