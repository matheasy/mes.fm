import type { WalletKey } from '../wallets';
import { assetKey } from './assetKey';
import { isOwnAddress } from './ownAddresses';

/**
 * Canadian adjusted cost base (ACB) across every wallet at once.
 *
 * The CRA treats all units of the same crypto you own as identical property: one pool per asset,
 * whatever wallet or chain holds it, with an average cost (ACB) that each purchase updates and
 * each disposal draws down. FIFO/LIFO aren't allowed. So this can't be done per wallet (which is
 * what the per-app /api/gains routes do) - it needs every wallet's full history in one timeline:
 *
 *  1. Legs whose other side is one of the owner's own addresses are skipped: moving coins between
 *     your own wallets isn't a disposition (ownAddresses.ts).
 *  2. Within one transaction, legs of the same asset are netted (wrapping BNB into WBNB, an LP
 *     refund of the coin just deposited) so a wrap isn't a sale + a purchase.
 *  3. Every priced leg, oldest first: a receipt adds units and their value (cost) to the asset's
 *     pool; a send/swap-away is a disposition - proceeds = value at that day's price, cost = the
 *     pool's average cost x units, gain = the difference. Legs with no price (scam airdrops,
 *     tokens CoinGecko doesn't know) are skipped.
 *  4. Every amount is converted to CAD at the Bank of Canada rate *of its own date*, and the pools
 *     are kept in CAD directly (ACB is a CAD figure) as well as in USD for reference.
 *
 * Deliberately simple where the data can't tell more:
 *  - Units disposed that the tracked history never shows arriving (bought before tracking began,
 *    or on an untracked exchange) get a cost of 0 and are flagged (`uncoveredQuantity`).
 *  - A disposal labelled as a personal transfer (e.g. to the owner's own exchange account) leaves
 *    the pool at cost with no gain (`transferIds`).
 *  - Gas fees are neither added to cost nor deducted from proceeds; income (staking/farming
 *    rewards, airdrops) is only used as the cost of what was received, not reported as income;
 *    the superficial-loss rule isn't applied. Hyperliquid perpetuals aren't included.
 */

export interface TaxEntry {
  /** Which tracked wallet reported this leg */
  source: WalletKey;
  hash: string;
  network: string;
  timestamp: string;
  symbol: string;
  /** Signed units: positive = received, negative = sent */
  amount: number;
  priceUsd: number | null;
  from: string;
  to: string;
}

export interface AcbDisposal {
  /** Stable row id - also the key labels are stored under (lib/labels.ts) */
  id: string;
  wallet: WalletKey;
  network: string;
  hash: string;
  disposedAt: string;
  taxYear: number;
  /** ACB pool, e.g. BTC for BTCB */
  asset: string;
  /** Token as it appeared on chain */
  symbol: string;
  quantity: number;
  priceUsd: number;
  proceedsUsd: number;
  costUsd: number;
  gainUsd: number;
  /** USD/CAD on the disposal date (null only if no Bank of Canada rate could be resolved at all) */
  cadRate: number | null;
  proceedsCad: number | null;
  costCad: number | null;
  gainCad: number | null;
  /** Units the tracked history never shows being acquired - counted at a cost of 0 */
  uncoveredQuantity: number;
  /** Labelled as a transfer to the owner's own account elsewhere: no gain, not a disposition */
  isTransfer: boolean;
}

export interface AcbHolding {
  asset: string;
  quantity: number;
  acbUsd: number;
  acbCad: number | null;
}

export interface AcbStats {
  /** Legs considered (non-zero amount) */
  legs: number;
  /** Legs skipped because the other side is one of the owner's own addresses */
  ownTransfers: number;
  /** Legs netted away inside a single transaction (wraps, same-asset refunds) */
  netted: number;
  /** Legs skipped for having no price */
  unpriced: number;
}

export interface AcbResult {
  disposals: AcbDisposal[];
  /** What's left in each pool after the last transaction: units and their ACB */
  holdings: AcbHolding[];
  stats: AcbStats;
}

const EPS = 1e-12;

/** Calendar year in the owner's own time zone (Vancouver): a trade at 8pm Pacific on Dec 31 is still in
 * that tax year, although it's already Jan 1 in UTC. */
const YEAR_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Vancouver', year: 'numeric' });
function taxYearOf(iso: string): number {
  return Number(YEAR_FMT.format(new Date(iso)));
}

export function disposalId(e: Pick<TaxEntry, 'source' | 'network' | 'hash' | 'symbol' | 'timestamp'>): string {
  return [e.source, e.network, e.hash, e.symbol, e.timestamp].join(':');
}

/** Nets same-asset legs within one transaction; returns the surviving legs and how many were netted away */
function netWithinTransactions(entries: TaxEntry[]): { legs: TaxEntry[]; netted: number } {
  const groups = new Map<string, TaxEntry[]>();
  for (const e of entries) {
    const k = `${e.hash}|${assetKey(e.symbol)}`;
    const g = groups.get(k);
    if (g) g.push(e);
    else groups.set(k, [e]);
  }

  const legs: TaxEntry[] = [];
  let netted = 0;
  for (const g of groups.values()) {
    if (g.length === 1 || !(g.some((e) => e.amount > 0) && g.some((e) => e.amount < 0))) {
      legs.push(...g);
      continue;
    }
    const net = g.reduce((sum, e) => sum + e.amount, 0);
    netted += g.length;
    if (Math.abs(net) <= EPS) continue;
    // keep the net as one leg, carrying the details of the biggest leg on its side
    const side = g.filter((e) => Math.sign(e.amount) === Math.sign(net)).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const base = side[0]!;
    legs.push({ ...base, amount: net });
    netted -= 1;
  }
  return { legs, netted };
}

export function computeAcb(
  entries: TaxEntry[],
  cadRates: Map<string, number>,
  transferIds: ReadonlySet<string> = new Set(),
): AcbResult {
  const stats: AcbStats = { legs: 0, ownTransfers: 0, netted: 0, unpriced: 0 };

  const external: TaxEntry[] = [];
  for (const e of entries) {
    if (e.amount === 0) continue;
    stats.legs += 1;
    const counterparty = e.amount > 0 ? e.from : e.to;
    if (isOwnAddress(counterparty)) {
      stats.ownTransfers += 1;
      continue;
    }
    external.push(e);
  }

  const { legs, netted } = netWithinTransactions(external);
  stats.netted = netted;

  // oldest first; within the same moment receipts before disposals, so a same-block buy-then-sell
  // doesn't read as selling units that aren't there yet
  legs.sort((a, b) => {
    const t = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    return t !== 0 ? t : b.amount - a.amount;
  });

  // Weekend/holiday dates are already resolved to the previous business day by getCadRates; if the
  // Bank of Canada couldn't be reached for a date at all, the nearest earlier resolved rate stands in.
  let lastRate: number | null = null;
  const rateOn = (iso: string): number | null => {
    const r = cadRates.get(iso.slice(0, 10));
    if (r !== undefined) lastRate = r;
    return r ?? lastRate;
  };
  let cadComplete = true;

  const pools = new Map<string, { qty: number; costUsd: number; costCad: number }>();
  const disposals: AcbDisposal[] = [];

  for (const e of legs) {
    if (e.priceUsd === null || !Number.isFinite(e.priceUsd)) {
      stats.unpriced += 1;
      continue;
    }
    const asset = assetKey(e.symbol);
    const pool = pools.get(asset) ?? { qty: 0, costUsd: 0, costCad: 0 };
    pools.set(asset, pool);
    const rate = rateOn(e.timestamp);
    if (rate === null) cadComplete = false;
    const valueUsd = Math.abs(e.amount) * e.priceUsd;

    if (e.amount > 0) {
      pool.qty += e.amount;
      pool.costUsd += valueUsd;
      pool.costCad += valueUsd * (rate ?? 0);
      continue;
    }

    const qty = -e.amount;
    const held = Math.max(pool.qty, 0);
    const covered = Math.min(qty, held);
    const share = held > EPS ? covered / held : 0;
    const costUsd = pool.costUsd * share;
    const costCad = pool.costCad * share;
    pool.qty -= covered;
    pool.costUsd -= costUsd;
    pool.costCad -= costCad;
    if (pool.qty <= EPS) {
      pool.qty = 0;
      pool.costUsd = 0;
      pool.costCad = 0;
    }

    const id = disposalId(e);
    const isTransfer = transferIds.has(id);
    const proceedsUsd = isTransfer ? costUsd : valueUsd;
    const proceedsCad = rate === null ? null : isTransfer ? costCad : valueUsd * rate;

    disposals.push({
      id,
      wallet: e.source,
      network: e.network,
      hash: e.hash,
      disposedAt: e.timestamp,
      taxYear: taxYearOf(e.timestamp),
      asset,
      symbol: e.symbol,
      quantity: qty,
      priceUsd: e.priceUsd,
      proceedsUsd,
      costUsd,
      gainUsd: proceedsUsd - costUsd,
      cadRate: rate,
      proceedsCad,
      costCad: rate === null ? null : costCad,
      gainCad: proceedsCad === null ? null : proceedsCad - costCad,
      uncoveredQuantity: qty - covered,
      isTransfer,
    });
  }

  const holdings: AcbHolding[] = [...pools.entries()]
    .filter(([, p]) => p.qty > 1e-9)
    .map(([asset, p]) => ({ asset, quantity: p.qty, acbUsd: p.costUsd, acbCad: cadComplete ? p.costCad : null }))
    .sort((a, b) => b.acbUsd - a.acbUsd);

  return { disposals, holdings, stats };
}
