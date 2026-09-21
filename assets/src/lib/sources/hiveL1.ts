import { HIVE_ACCOUNT, HIVE_RPC_NODES } from '../config';
import { fetchJson } from '../http';
import { getSpot } from '../prices';
import type { RawHolding, SourceResult } from '../types';

/**
 * Hive layer 1 (what peakd.com/@mes/wallet shows): liquid HIVE/HBD, Hive Power, savings, and
 * unclaimed rewards. Keyless public RPC; ONE get_accounts + ONE dynamic-global-properties call.
 */

async function hiveRpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  for (const node of HIVE_RPC_NODES) {
    try {
      const res = await fetchJson<{ result?: T; error?: { message: string } }>(node, {
        method: 'POST',
        body: { jsonrpc: '2.0', method, params, id: 1 },
        retries: 1,
        timeoutMs: 15_000,
      });
      if (res.error) throw new Error(`Hive RPC error: ${res.error.message}`);
      if (res.result === undefined) throw new Error('Hive RPC returned no result');
      return res.result;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('all Hive RPC nodes failed');
}

/** "16546.980 HIVE" -> 16546.98 */
const amt = (s: string | undefined): number => {
  const n = Number.parseFloat(String(s ?? '0').split(' ')[0]!);
  return Number.isFinite(n) ? n : 0;
};

interface HiveAccount {
  balance: string;
  hbd_balance: string;
  savings_balance: string;
  savings_hbd_balance: string;
  vesting_shares: string;
  delegated_vesting_shares: string;
  received_vesting_shares: string;
  reward_hive_balance: string;
  reward_hbd_balance: string;
  reward_vesting_hive: string;
}

interface Dgp {
  total_vesting_fund_hive: string;
  total_vesting_shares: string;
}

export async function fetchHiveL1(account = HIVE_ACCOUNT): Promise<SourceResult> {
  const [accounts, dgp, spot] = await Promise.all([
    hiveRpc<HiveAccount[]>('condenser_api.get_accounts', [[account]]),
    hiveRpc<Dgp>('condenser_api.get_dynamic_global_properties', []),
    getSpot(),
  ]);

  const acc = accounts[0];
  if (!acc) throw new Error(`Hive account @${account} not found`);

  const hiveUsd = spot.hive.usd;
  const hbdUsd = spot.hive_dollar.usd;
  const vestsToHp = (vests: number) => (vests * amt(dgp.total_vesting_fund_hive)) / amt(dgp.total_vesting_shares);

  const hp = vestsToHp(amt(acc.vesting_shares));
  const delegatedOutHp = vestsToHp(amt(acc.delegated_vesting_shares));
  const delegatedInHp = vestsToHp(amt(acc.received_vesting_shares));

  const rows: RawHolding[] = [];
  const push = (r: { symbol: 'HIVE' | 'HBD'; kind: RawHolding['kind']; amount: number; label?: string; detail?: string }) => {
    if (r.amount <= 0) return;
    const priceUsd = r.symbol === 'HIVE' ? hiveUsd : hbdUsd;
    const change24hPct = r.symbol === 'HIVE' ? spot.hive.change24h : spot.hive_dollar.change24h;
    rows.push({ symbol: r.symbol, kind: r.kind, label: r.label, detail: r.detail, amount: r.amount, priceUsd, valueUsd: r.amount * priceUsd, change24hPct });
  };

  push({ symbol: 'HIVE', kind: 'token', amount: amt(acc.balance), label: 'HIVE' });
  push({ symbol: 'HBD', kind: 'token', amount: amt(acc.hbd_balance), label: 'HBD' });
  push({
    symbol: 'HIVE',
    kind: 'staked',
    amount: hp,
    label: 'Hive Power',
    detail: [delegatedOutHp > 0 ? `${delegatedOutHp.toFixed(0)} HP delegated out` : '', delegatedInHp > 0 ? `${delegatedInHp.toFixed(0)} HP delegated in (not owned)` : '']
      .filter(Boolean)
      .join(' · ') || undefined,
  });
  push({ symbol: 'HIVE', kind: 'savings', amount: amt(acc.savings_balance), label: 'HIVE savings' });
  push({ symbol: 'HBD', kind: 'savings', amount: amt(acc.savings_hbd_balance), label: 'HBD savings' });
  push({ symbol: 'HIVE', kind: 'reward', amount: amt(acc.reward_hive_balance), label: 'Unclaimed HIVE' });
  push({ symbol: 'HBD', kind: 'reward', amount: amt(acc.reward_hbd_balance), label: 'Unclaimed HBD' });
  push({ symbol: 'HIVE', kind: 'reward', amount: amt(acc.reward_vesting_hive), label: 'Unclaimed HP' });

  return { holdings: rows };
}
