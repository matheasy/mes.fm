import { cached, cacheKey } from '../../cache';
import type { TaxEntry } from '../acb';
import { BTC_ADDRESS } from '../accounts';
import { getDailySeries, priceOn } from '../dailyPrices';

const API = 'https://mempool.space/api';

interface MempoolTx {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: { prevout: { scriptpubkey_address?: string; value: number } | null }[];
  vout: { scriptpubkey_address?: string; value: number }[];
}

/** Every confirmed transaction touching the address: the first page, then 25 at a time after the last seen txid */
async function getAllTxs(address: string): Promise<MempoolTx[]> {
  const out: MempoolTx[] = [];
  let url = `${API}/address/${address}/txs`;
  for (let page = 0; page < 200; page++) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`mempool.space answered ${res.status}`);
    const batch = ((await res.json()) as MempoolTx[]).filter((t) => t.status.confirmed);
    out.push(...batch);
    if (batch.length < 25) return out;
    url = `${API}/address/${address}/txs/chain/${batch[batch.length - 1]!.txid}`;
  }
  throw new Error('Bitcoin address history is longer than 5,000 transactions');
}

/**
 * The native Bitcoin address's history as tax legs (keyless, mempool.space): one leg per
 * transaction, its net effect on the address in BTC (received outputs minus spent inputs, so a
 * spend's own fee counts as BTC disposed of). It joins the one BTC pool with BTCB/WBTC/SWAP.BTC.
 */
export async function getBitcoinEntries(): Promise<TaxEntry[]> {
  const txs = await cached(cacheKey('btc-txs', BTC_ADDRESS), () => getAllTxs(BTC_ADDRESS), 30 * 60);
  const first = txs.reduce((min, t) => Math.min(min, t.status.block_time ?? Infinity), Infinity);
  if (!Number.isFinite(first)) return [];
  const series = await getDailySeries('bitcoin', new Date(first * 1000).toISOString());

  const entries: TaxEntry[] = [];
  for (const t of txs) {
    const received = t.vout.filter((o) => o.scriptpubkey_address === BTC_ADDRESS).reduce((s, o) => s + o.value, 0);
    const spent = t.vin.filter((i) => i.prevout?.scriptpubkey_address === BTC_ADDRESS).reduce((s, i) => s + (i.prevout?.value ?? 0), 0);
    const net = (received - spent) / 1e8;
    if (net === 0 || !t.status.block_time) continue;

    const timestamp = new Date(t.status.block_time * 1000).toISOString();
    const counterparty =
      net > 0
        ? (t.vin.find((i) => i.prevout?.scriptpubkey_address && i.prevout.scriptpubkey_address !== BTC_ADDRESS)?.prevout?.scriptpubkey_address ?? 'unknown')
        : (t.vout.find((o) => o.scriptpubkey_address && o.scriptpubkey_address !== BTC_ADDRESS)?.scriptpubkey_address ?? 'unknown');

    entries.push({
      source: 'bitcoin',
      hash: t.txid,
      network: 'bitcoin-l1',
      timestamp,
      symbol: 'BTC',
      amount: net,
      priceUsd: priceOn(series, timestamp),
      from: net > 0 ? counterparty : BTC_ADDRESS,
      to: net > 0 ? BTC_ADDRESS : counterparty,
    });
  }
  return entries;
}
