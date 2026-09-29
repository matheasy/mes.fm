import { cached, cacheKey } from '../../cache';
import type { TaxEntry } from '../acb';
import { XRP_ADDRESS } from '../accounts';
import { getDailySeries, priceOn } from '../dailyPrices';

const NODES = ['https://xrplcluster.com/', 'https://s1.ripple.com:51234/', 'https://s2.ripple.com:51234/'];

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  let lastError: unknown;
  for (const node of NODES) {
    try {
      const res = await fetch(node, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params: [params] }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${node} answered ${res.status}`);
      const json = (await res.json()) as { result?: T & { status?: string; error_message?: string; error?: string } };
      if (!json.result || json.result.status === 'error') throw new Error(`XRPL: ${json.result?.error_message ?? json.result?.error ?? 'no result'}`);
      return json.result;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No XRP Ledger node answered');
}

interface AffectedNode {
  LedgerEntryType: string;
  FinalFields?: Record<string, unknown>;
  NewFields?: Record<string, unknown>;
  PreviousFields?: Record<string, unknown>;
}

interface TxEntry {
  tx?: Record<string, unknown>;
  tx_json?: Record<string, unknown>;
  hash?: string;
  close_time_iso?: string;
  meta: { TransactionResult: string; AffectedNodes: Record<string, AffectedNode>[] };
}

/** Seconds from the Unix epoch to the Ripple epoch (2000-01-01) */
const RIPPLE_EPOCH = 946_684_800;

/** Compact form of one transaction: what it did to this account's XRP balance */
interface XrpMove {
  hash: string;
  timestamp: string;
  type: string;
  /** change in the account's XRP balance, fee included (XRP) */
  delta: number;
  feeXrp: number;
  account: string;
  destination: string | null;
}

async function getMoves(address: string): Promise<XrpMove[]> {
  const out: XrpMove[] = [];
  let marker: unknown = undefined;
  for (let page = 0; page < 500; page++) {
    const r = await rpc<{ transactions: TxEntry[]; marker?: unknown }>('account_tx', {
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 400,
      forward: true,
      ...(marker ? { marker } : {}),
    });
    for (const t of r.transactions) {
      const tx = t.tx ?? t.tx_json ?? {};
      if (t.meta?.TransactionResult !== 'tesSUCCESS') continue;
      // the account's own balance before and after, straight from the ledger's metadata
      let delta = 0;
      for (const wrapper of t.meta.AffectedNodes) {
        const node = wrapper.ModifiedNode ?? wrapper.CreatedNode ?? wrapper.DeletedNode;
        if (!node || node.LedgerEntryType !== 'AccountRoot') continue;
        const fields = node.FinalFields ?? node.NewFields ?? {};
        if (fields.Account !== address) continue;
        const final = Number(fields.Balance ?? 0);
        const prev = wrapper.CreatedNode ? 0 : node.PreviousFields?.Balance !== undefined ? Number(node.PreviousFields.Balance) : final;
        delta = (final - prev) / 1e6;
      }
      const date = typeof tx.date === 'number' ? new Date((tx.date + RIPPLE_EPOCH) * 1000).toISOString() : t.close_time_iso ?? null;
      if (!date || delta === 0) continue;
      out.push({
        hash: String(tx.hash ?? t.hash ?? ''),
        timestamp: date,
        type: String(tx.TransactionType ?? ''),
        delta,
        feeXrp: tx.Account === address ? Number(tx.Fee ?? 0) / 1e6 : 0,
        account: String(tx.Account ?? ''),
        destination: typeof tx.Destination === 'string' ? tx.Destination : null,
      });
    }
    marker = r.marker;
    if (!marker) return out;
  }
  throw new Error('XRP history longer than expected');
}

/**
 * The XRP address's history as tax legs (keyless XRP Ledger JSON-RPC). Each successful transaction's
 * leg is the exact change in the account's XRP balance from the ledger's own metadata (fee
 * included), so payments, escrows and any DEX fills are all counted exactly - the changes add up to
 * the current balance (checked 2026-09-29: 36 transactions, 11,837.740347 XRP).
 *  - Escrows the account creates and cancels to/for itself are its own XRP being locked and returned.
 *  - Transactions that only cost the network fee (checks, account settings, trust lines) are left
 *    out: a fraction of a cent each.
 */
export async function getXrpEntries(): Promise<TaxEntry[]> {
  const moves = await cached(cacheKey('xrp-moves-v1', XRP_ADDRESS), () => getMoves(XRP_ADDRESS), 30 * 60);
  if (moves.length === 0) return [];
  const series = await getDailySeries('ripple', moves[0]!.timestamp);

  const entries: TaxEntry[] = [];
  for (const m of moves) {
    const feeOnly = m.delta < 0 && Math.abs(Math.abs(m.delta) - m.feeXrp) < 1e-9;
    if (feeOnly && m.type !== 'Payment') continue;

    let counterparty: string;
    if (m.type.startsWith('Escrow')) {
      // an escrow to/from itself is the account's own XRP being locked or returned
      counterparty = m.destination && m.destination !== XRP_ADDRESS ? m.destination : XRP_ADDRESS;
    } else if (m.type === 'Payment') {
      counterparty = m.delta > 0 ? m.account : (m.destination ?? 'unknown');
    } else {
      counterparty = 'xrpl-dex';
    }

    entries.push({
      source: 'xrp',
      hash: m.hash,
      network: 'xrp',
      timestamp: m.timestamp,
      symbol: 'XRP',
      amount: m.delta,
      priceUsd: priceOn(series, m.timestamp),
      from: m.delta > 0 ? counterparty : XRP_ADDRESS,
      to: m.delta > 0 ? XRP_ADDRESS : counterparty,
    });
  }
  return entries;
}
