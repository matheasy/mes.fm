import { FETCH_FLOOR_USD, HIVE_ACCOUNT, HIVE_ENGINE_RPC, MAGI_API, MAGI_BTC_CONTRACT, MAGI_INDEXER } from '../config';
import { cached, cacheKey } from '../cache';
import { fetchJson } from '../http';
import { getSpot } from '../prices';
import type { LpLeg, RawHolding, SourceResult } from '../types';
import { fetchHePrices } from './hiveEngine';
import { constantProductValueUsd } from './poolValue';

/**
 * Magi Network (formerly VSC; the altera.magi.eco wallet) - a layer that settles on Hive. An
 * account is the DID `hive:<name>`. Three things live there:
 *  - HIVE / HBD balances (liquid, HBD savings, HIVE staked for consensus) via `getAccountBalance`
 *  - bridged BTC, in the BTC-mapping contract's state (key `a-<did>`, value = sats, hex)
 *  - DEX liquidity-pool positions, valued from the indexer's pool reserves
 * Amounts are integers in each asset's smallest unit: HIVE/HBD are 3 decimals, BTC is 8.
 */

async function magiGql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetchJson<{ data?: T; errors?: { message: string }[] }>(MAGI_API, {
    method: 'POST',
    body: { query, variables },
    throttle: { key: 'magi', minIntervalMs: 250 },
  });
  if (res.errors?.length) throw new Error(`Magi error: ${res.errors[0]!.message}`);
  if (!res.data) throw new Error('Magi returned no data');
  return res.data;
}

async function indexerGql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetchJson<{ data?: T; errors?: { message: string }[] }>(MAGI_INDEXER, {
    method: 'POST',
    body: { query, variables },
    throttle: { key: 'magi', minIntervalMs: 250 },
  });
  if (res.errors?.length) throw new Error(`Magi indexer error: ${res.errors[0]!.message}`);
  if (!res.data) throw new Error('Magi indexer returned no data');
  return res.data;
}

interface BalanceRecord {
  hbd: number;
  hbd_savings: number;
  hive: number;
  hive_consensus: number;
  consensus_unstaking: number;
  pending_hbd_unstaking: number | null;
}

/** Decimals for an asset symbol on Magi; custom tokens mirror their Hive Engine precision */
async function assetDecimals(symbol: string): Promise<number> {
  const s = symbol.toLowerCase();
  if (s === 'hive' || s === 'hbd') return 3;
  if (s === 'btc') return 8;
  return cached(cacheKey('discovery', 'he-precision', s), 7 * 24 * 3600, async () => {
    try {
      const res = await fetchJson<{ result?: { precision?: number }[] }>(`${HIVE_ENGINE_RPC}/contracts`, {
        method: 'POST',
        body: { jsonrpc: '2.0', id: 1, method: 'find', params: { contract: 'tokens', table: 'tokens', query: { symbol: symbol.toUpperCase() }, limit: 1 } },
        throttle: { key: 'hive-engine', minIntervalMs: 250 },
      });
      return res.result?.[0]?.precision ?? 8;
    } catch {
      return 8;
    }
  });
}

/** Registry assets come back as plain strings, or JSON like {"asset":"lassecash",...} for custom tokens */
function assetSymbol(raw: unknown): string {
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('{')) {
      try {
        const o = JSON.parse(t) as { asset?: string };
        if (o.asset) return o.asset.toLowerCase();
      } catch {
        /* fall through */
      }
    }
    return t.toLowerCase();
  }
  if (raw && typeof raw === 'object' && 'asset' in raw) return String((raw as { asset: unknown }).asset).toLowerCase();
  return '?';
}

export async function fetchMagi(account = HIVE_ACCOUNT): Promise<SourceResult> {
  const did = `hive:${account}`;

  const [{ getAccountBalance: bal }, btcState, lp, spot] = await Promise.all([
    magiGql<{ getAccountBalance: BalanceRecord | null }>(
      `query($a:String!){ getAccountBalance(account:$a){ hbd hbd_savings hive hive_consensus consensus_unstaking pending_hbd_unstaking } }`,
      { a: did },
    ),
    magiGql<{ getStateByKeys: Record<string, string | null> }>(
      `query($c:String!,$k:[String!]!,$e:String){ getStateByKeys(contractId:$c, keys:$k, encoding:$e) }`,
      { c: MAGI_BTC_CONTRACT, k: [`a-${did}`], e: 'hex' },
    ),
    indexerGql<{
      dex_pool_lp_positions: { pool_contract: string; lp_balance: number | string }[];
      dex_pool_registry: { pool_contract: string; asset0: unknown; asset1: unknown }[];
      dex_pool_liquidity: { pool_contract: string; reserve0: number | string; reserve1: number | string; total_lp: number | string }[];
    }>(
      `query($p:String!){
        dex_pool_lp_positions(where:{provider:{_eq:$p}, lp_balance:{_gt:"0"}}){ pool_contract lp_balance }
        dex_pool_registry{ pool_contract asset0 asset1 }
        dex_pool_liquidity{ pool_contract reserve0 reserve1 total_lp }
      }`,
      { p: did },
    ),
    getSpot(),
  ]);

  const hiveUsd = spot.hive.usd;
  const hbdUsd = spot.hive_dollar.usd;
  const btcUsd = spot.bitcoin.usd;
  const rows: RawHolding[] = [];

  const push = (symbol: 'HIVE' | 'HBD' | 'BTC', kind: RawHolding['kind'], amount: number, label: string, detail?: string) => {
    if (amount <= 0) return;
    const q = symbol === 'HIVE' ? spot.hive : symbol === 'HBD' ? spot.hive_dollar : spot.bitcoin;
    const valueUsd = amount * q.usd;
    if (valueUsd < FETCH_FLOOR_USD) return;
    rows.push({ symbol, kind, label, detail, amount, priceUsd: q.usd, valueUsd, change24hPct: q.change24h });
  };

  if (bal) {
    push('HIVE', 'token', bal.hive / 1000, 'HIVE (Magi)');
    push('HIVE', 'staked', (bal.hive_consensus + bal.consensus_unstaking) / 1000, 'HIVE staked (Magi consensus)');
    push('HBD', 'token', bal.hbd / 1000, 'HBD (Magi)');
    push('HBD', 'savings', (bal.hbd_savings + (bal.pending_hbd_unstaking ?? 0)) / 1000, 'HBD savings (Magi)');
  }

  const btcHex = btcState.getStateByKeys[`a-${did}`];
  if (btcHex) push('BTC', 'token', (Number.parseInt(btcHex, 16) || 0) / 1e8, 'BTC (Magi)');

  // ---- LP positions ----
  const registry = new Map(lp.dex_pool_registry.map((r) => [r.pool_contract, [assetSymbol(r.asset0), assetSymbol(r.asset1)] as [string, string]]));
  const liquidity = new Map(lp.dex_pool_liquidity.map((l) => [l.pool_contract, l]));

  const customSymbols = new Set<string>();
  for (const pos of lp.dex_pool_lp_positions) {
    for (const s of registry.get(pos.pool_contract) ?? []) if (!['hive', 'hbd', 'btc'].includes(s)) customSymbols.add(s.toUpperCase());
  }
  const hePrices = customSymbols.size > 0 ? await fetchHePrices([...customSymbols]) : {};

  const usdOf = (sym: string): number | null => {
    if (sym === 'hive') return hiveUsd;
    if (sym === 'hbd') return hbdUsd;
    if (sym === 'btc') return btcUsd;
    const p = hePrices[sym.toUpperCase()];
    return p ? p.hive * hiveUsd : null;
  };

  for (const pos of lp.dex_pool_lp_positions) {
    const pair = registry.get(pos.pool_contract);
    const liq = liquidity.get(pos.pool_contract);
    if (!pair || !liq) continue;

    const totalLp = Number(liq.total_lp);
    const share = totalLp > 0 ? Number(pos.lp_balance) / totalLp : 0;
    if (share <= 0) continue;

    const [d0, d1] = await Promise.all([assetDecimals(pair[0]), assetDecimals(pair[1])]);
    const legs: LpLeg[] = [
      { symbol: pair[0].toUpperCase(), amount: (share * Number(liq.reserve0)) / 10 ** d0, valueUsd: null },
      { symbol: pair[1].toUpperCase(), amount: (share * Number(liq.reserve1)) / 10 ** d1, valueUsd: null },
    ];
    legs.forEach((leg, i) => {
      const price = usdOf(pair[i]!);
      leg.valueUsd = price === null ? null : leg.amount * price;
    });

    const valueUsd = constantProductValueUsd(legs, (sym) => ['HIVE', 'HBD', 'BTC'].includes(sym));
    if (valueUsd === null || valueUsd < FETCH_FLOOR_USD) continue;

    const poolName = `${legs[0]!.symbol}/${legs[1]!.symbol}`;
    rows.push({
      symbol: poolName,
      kind: 'lp',
      label: `${poolName} pool (Magi)`,
      amount: Number(pos.lp_balance),
      priceUsd: null,
      valueUsd,
      change24hPct: null,
      detail: `${(share * 100).toFixed(4)}% of the pool`,
      lp: { pool: poolName, share, legs },
    });
  }

  return { holdings: rows };
}
