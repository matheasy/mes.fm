import { FETCH_FLOOR_USD, HYPERLIQUID_INFO, RPC_URLS } from '../config';
import { cached, cacheKey } from '../cache';
import { fetchJson } from '../http';
import { getSpot } from '../prices';
import { rpcOne, scale } from '../rpc';
import type { RawHolding, SourceResult } from '../types';

/**
 * Hyperliquid, for one EVM address (keyless public API):
 *  - spot balances (HyperCore) - priced from each token's USDC spot pair
 *  - perpetuals account equity (margin balance incl. unrealised PnL)
 *  - vault deposits (e.g. HLP)
 *  - HYPE staking (delegated + undelegated + pending withdrawal)
 *  - native HYPE on HyperEVM (public RPC)
 * The perps/vault/staking figures are already USD (or HYPE) straight from the API.
 */

const info = <T,>(body: Record<string, unknown>) =>
  fetchJson<T>(HYPERLIQUID_INFO, { method: 'POST', body, throttle: { key: 'hyperliquid', minIntervalMs: 150 } });

interface SpotMeta {
  tokens: { name: string; index: number }[];
  universe: { tokens: [number, number]; name: string; index: number }[];
}
interface AssetCtx {
  markPx?: string;
  midPx?: string | null;
}

/** USDC-quoted spot price per HyperCore token index (shared across all wallets, cached) */
async function spotPrices(): Promise<Map<number, number>> {
  const entries = await cached(cacheKey('price', 'hl-spot'), 180, async () => {
    const [meta, ctxs] = await info<[SpotMeta, AssetCtx[]]>({ type: 'spotMetaAndAssetCtxs' });
    const out: [number, number][] = [[0, 1]]; // USDC
    meta.universe.forEach((u, i) => {
      const [base, quote] = u.tokens;
      if (quote !== 0) return; // only USDC-quoted pairs
      const px = Number(ctxs[i]?.markPx ?? ctxs[i]?.midPx);
      if (Number.isFinite(px) && px > 0) out.push([base, px]);
    });
    return out;
  });
  return new Map(entries);
}

export async function fetchHyperliquid(address: string): Promise<SourceResult> {
  const [spot, spotState, perp, vaults, staking, evmHex, prices] = await Promise.all([
    getSpot(),
    info<{ balances: { coin: string; token: number; total: string }[] }>({ type: 'spotClearinghouseState', user: address }),
    info<{ marginSummary: { accountValue: string } }>({ type: 'clearinghouseState', user: address }),
    info<{ vaultAddress: string; equity: string }[]>({ type: 'userVaultEquities', user: address }),
    info<{ delegated: string; undelegated: string; totalPendingWithdrawal: string }>({ type: 'delegatorSummary', user: address }),
    rpcOne(RPC_URLS.hyperliquid, { method: 'eth_getBalance', params: [address, 'latest'] }).catch(() => null),
    spotPrices(),
  ]);

  const hypeUsd = spot.hyperliquid.usd;
  const rows: RawHolding[] = [];

  for (const b of spotState.balances) {
    const amount = Number(b.total);
    if (!(amount > 0)) continue;
    // stablecoins with no USDC pair (USDT0, USDE, USDH) are ~1 USD
    const px = prices.get(b.token) ?? (/^US/i.test(b.coin) ? 1 : null);
    if (px === null) continue;
    const valueUsd = amount * px;
    if (valueUsd < FETCH_FLOOR_USD) continue;
    rows.push({ symbol: b.coin, kind: 'token', label: `${b.coin} (Hyperliquid spot)`, amount, priceUsd: px, valueUsd, change24hPct: b.coin === 'HYPE' ? spot.hyperliquid.change24h : null });
  }

  const perpEquity = Number(perp.marginSummary.accountValue);
  if (perpEquity >= FETCH_FLOOR_USD) {
    rows.push({ symbol: 'USDC', kind: 'perp', label: 'Perps account equity', amount: perpEquity, priceUsd: 1, valueUsd: perpEquity, change24hPct: null, detail: 'margin balance incl. unrealised PnL' });
  }

  for (const v of vaults) {
    const equity = Number(v.equity);
    if (equity < FETCH_FLOOR_USD) continue;
    rows.push({ symbol: 'USDC', kind: 'vault', label: 'Vault deposit', contract: v.vaultAddress, amount: equity, priceUsd: 1, valueUsd: equity, change24hPct: null, detail: `vault ${v.vaultAddress.slice(0, 8)}…` });
  }

  const staked = Number(staking.delegated) + Number(staking.undelegated) + Number(staking.totalPendingWithdrawal);
  if (staked > 0 && staked * hypeUsd >= FETCH_FLOOR_USD) {
    rows.push({
      symbol: 'HYPE',
      kind: 'staked',
      label: 'HYPE staking',
      amount: staked,
      priceUsd: hypeUsd,
      valueUsd: staked * hypeUsd,
      change24hPct: spot.hyperliquid.change24h,
      detail: `delegated ${Number(staking.delegated)} · undelegated ${Number(staking.undelegated)} · withdrawing ${Number(staking.totalPendingWithdrawal)}`,
    });
  }

  const evmHype = evmHex ? scale(BigInt(evmHex), 18) : 0;
  if (evmHype * hypeUsd >= FETCH_FLOOR_USD) {
    rows.push({ symbol: 'HYPE', kind: 'token', label: 'HYPE (HyperEVM native)', amount: evmHype, priceUsd: hypeUsd, valueUsd: evmHype * hypeUsd, change24hPct: spot.hyperliquid.change24h });
  }

  return { holdings: rows };
}
