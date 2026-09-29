import { FETCH_FLOOR_USD, XRPL_RPC, XRP_ADDRESS } from '../config';
import { fetchJson } from '../http';
import { getSpot } from '../prices';
import type { SourceResult } from '../types';

/** XRP Ledger: the native XRP balance of one classic address (keyless public JSON-RPC). */
export async function fetchXrpl(address = XRP_ADDRESS): Promise<SourceResult> {
  const [res, spot] = await Promise.all([
    fetchJson<{ result?: { status?: string; error?: string; error_message?: string; account_data?: { Balance: string } } }>(XRPL_RPC, {
      method: 'POST',
      body: { method: 'account_info', params: [{ account: address, ledger_index: 'validated' }] },
      throttle: { key: 'xrpl', minIntervalMs: 300 },
    }),
    getSpot(),
  ]);

  const r = res.result;
  if (r?.error === 'actNotFound') return { holdings: [] };
  if (!r || r.status === 'error' || !r.account_data) throw new Error(`XRPL error: ${r?.error_message ?? r?.error ?? 'no account data'}`);

  const amount = Number(r.account_data.Balance) / 1_000_000;
  const priceUsd = spot.ripple.usd;
  if (amount * priceUsd < FETCH_FLOOR_USD) return { holdings: [] };

  return {
    holdings: [
      {
        symbol: 'XRP',
        kind: 'token',
        label: 'XRP',
        amount,
        priceUsd,
        valueUsd: amount * priceUsd,
        change24hPct: spot.ripple.change24h,
        detail: 'ledger balance (includes the account reserve)',
      },
    ],
  };
}
