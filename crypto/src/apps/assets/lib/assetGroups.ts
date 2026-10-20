import { assetKey } from '@/lib/tax/assetKey';
import type { AssetKind, Holding } from './types';

/**
 * Holdings grouped by the asset they really are: BTC with BTCB / WBTC / SWAP.BTC / native BTC, ETH with
 * WETH / UETH / SWAP.ETH, HIVE with Hive Power and SWAP.HIVE, HBD with savings and SWAP.HBD... - the same
 * pools the Taxes page uses (lib/tax/assetKey.ts). Liquidity positions are one group of their own (they
 * hold two coins at once), and so are perps.
 */
export interface AssetGroup {
  key: string;
  name: string;
  holdings: Holding[];
  /** Sum of the units, or null when they can't be added (LP shares, perps) */
  amount: number | null;
  valueUsd: number;
  /** Value / units, when the units add up */
  priceUsd: number | null;
  /** Value-weighted 24 h change of the parts that have one */
  change24hPct: number | null;
  kinds: AssetKind[];
  thin: boolean;
}

const NAMES: Record<string, string> = {
  BTC: 'Bitcoin (BTC)',
  ETH: 'Ether (ETH)',
  BNB: 'BNB',
  HIVE: 'Hive (HIVE)',
  HBD: 'Hive Dollars (HBD)',
  XRP: 'XRP',
  LP: 'Liquidity positions',
  PERP: 'Perpetual futures',
};

function keyOf(h: Holding): string {
  if (h.kind === 'lp') return 'LP';
  if (h.kind === 'perp') return 'PERP';
  return assetKey(h.symbol);
}

export function groupHoldings(holdings: Holding[]): AssetGroup[] {
  const map = new Map<string, Holding[]>();
  for (const h of holdings) {
    const k = keyOf(h);
    const list = map.get(k) ?? [];
    list.push(h);
    map.set(k, list);
  }
  const groups: AssetGroup[] = [];
  for (const [key, list] of map) {
    list.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
    const valueUsd = list.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
    const additive = key !== 'LP' && key !== 'PERP';
    const amount = additive ? list.reduce((s, h) => s + h.amount, 0) : null;
    const withChange = list.filter((h) => h.change24hPct !== null && (h.valueUsd ?? 0) > 0);
    const wsum = withChange.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
    groups.push({
      key,
      name: NAMES[key] ?? key,
      holdings: list,
      amount,
      valueUsd,
      priceUsd: amount && amount > 0 && valueUsd > 0 ? valueUsd / amount : null,
      change24hPct: wsum > 0 ? withChange.reduce((s, h) => s + (h.change24hPct ?? 0) * (h.valueUsd ?? 0), 0) / wsum : null,
      kinds: [...new Set(list.map((h) => h.kind))],
      thin: list.some((h) => h.thin),
    });
  }
  return groups.sort((a, b) => b.valueUsd - a.valueUsd);
}
