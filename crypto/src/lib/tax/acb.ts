import { assetKey } from './assetKey';
import { isFarmReward, isLpContract } from '../lp';
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
 *  - Income the data can recognise (claimed Hive rewards, HBD savings interest, witness and DHF
 *    pay - `TaxEntry.income`) is recorded as income at its value when received, which is also its
 *    cost. Other receipts from outside accounts (delegation payouts, airdrops, exchange
 *    withdrawals) are acquired at their value too and listed separately for the owner to decide.
 *  - A disposition with nothing coming back in the same transaction is a *send* (payment, gift,
 *    or a deposit to an exchange account) and is flagged for review; one with something coming
 *    back is a swap; one into a known liquidity-pool contract is an LP deposit.
 *  - The owner can enter the real cost of units the history doesn't cover (`costOverridesCad`).
 *  - Gas fees are neither added to cost nor deducted from proceeds; the superficial-loss rule
 *    isn't applied; Hyperliquid perpetuals aren't included.
 */

// Liquidity-pool contracts (PancakeSwap V3 position manager + its MasterChef V3 farm): sending into one
// is an LP deposit, receiving from one an LP withdrawal - except CAKE from the farm, which is a reward
const LP_CONTRACTS = { has: isLpContract };

export interface TaxEntry {
  /** Which tracked wallet/account reported this leg: main | ai | mfa | sov | bitcoin | hive:<account> */
  source: string;
  hash: string;
  network: string;
  timestamp: string;
  symbol: string;
  /** Signed units: positive = received, negative = sent */
  amount: number;
  priceUsd: number | null;
  from: string;
  to: string;
  /** Set for income (e.g. 'Hive rewards (claimed)'): acquired at its value, which is also income */
  income?: string;
  /**
   * A move to/from one of the owner's own holdings that isn't tracked (e.g. HIVE sent to Hive Engine's
   * peg): leaving, it exits the pool at cost with no gain, like a Personal-transfer label; arriving, it's
   * acquired at its value on the day and not treated as income.
   */
  bridge?: boolean;
  /** A market trade whose other side isn't tracked (a Hive Engine fill): a disposal is a swap, not a send */
  market?: boolean;
}

export type DisposalKind = 'swap' | 'send' | 'lp' | 'bridge';

export interface AcbDisposal {
  /** Stable row id - also the key labels are stored under (lib/labels.ts) */
  id: string;
  source: string;
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
  /** swap = something came back in the same transaction; lp = into a liquidity pool; send = nothing came back */
  kind: DisposalKind;
  /** Where it went (address / account / 'hive-market' ...) */
  counterparty: string;
  /** The owner entered the real cost of the uncovered units (label field) */
  costOverridden: boolean;
}

export interface AcbIncome {
  source: string;
  timestamp: string;
  taxYear: number;
  asset: string;
  kind: string;
  quantity: number;
  usd: number;
  cad: number | null;
}

/** Something received from an outside account that isn't recognisable income - acquired at its value; listed for review */
export interface AcbReceipt {
  source: string;
  timestamp: string;
  taxYear: number;
  asset: string;
  counterparty: string;
  quantity: number;
  usd: number;
  cad: number | null;
  /** Came out of a liquidity-pool contract (an LP withdrawal), so not income */
  fromLp: boolean;
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
  income: AcbIncome[];
  receipts: AcbReceipt[];
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
  costOverridesCad: ReadonlyMap<string, number> = new Map(),
): AcbResult {
  const stats: AcbStats = { legs: 0, ownTransfers: 0, netted: 0, unpriced: 0 };

  const external: TaxEntry[] = [];
  for (const e of entries) {
    if (e.amount === 0) continue;
    stats.legs += 1;
    const counterparty = e.amount > 0 ? e.from : e.to;
    if (!e.income && isOwnAddress(counterparty)) {
      stats.ownTransfers += 1;
      continue;
    }
    external.push(e);
  }

  const { legs, netted } = netWithinTransactions(external);
  stats.netted = netted;

  // what each transaction did overall, to tell a swap (something came back) from a send
  const hasIn = new Set<string>();
  const hasOut = new Set<string>();
  for (const e of legs) {
    if (e.income) continue;
    if (e.amount > 0) hasIn.add(e.hash);
    else hasOut.add(e.hash);
  }

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
  const income: AcbIncome[] = [];
  const receipts: AcbReceipt[] = [];

  for (const leg of legs) {
    // CAKE harvested from the PancakeSwap farm is income, like Hive rewards
    const e = leg.amount > 0 && !leg.income && isFarmReward(leg.symbol, leg.from) ? { ...leg, income: 'PancakeSwap farm rewards (CAKE)' } : leg;
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
      const base = { source: e.source, timestamp: e.timestamp, taxYear: taxYearOf(e.timestamp), asset, quantity: e.amount, usd: valueUsd, cad: rate === null ? null : valueUsd * rate };
      if (e.income) income.push({ ...base, kind: e.income });
      else if (!hasOut.has(e.hash) && !e.market) receipts.push({ ...base, counterparty: e.from, fromLp: !!e.bridge || LP_CONTRACTS.has(e.from.toLowerCase()) });
      continue;
    }

    const qty = -e.amount;
    const held = Math.max(pool.qty, 0);
    const covered = Math.min(qty, held);
    const share = held > EPS ? covered / held : 0;
    let costUsd = pool.costUsd * share;
    let costCad = pool.costCad * share;
    pool.qty -= covered;
    pool.costUsd -= costUsd;
    pool.costCad -= costCad;
    if (pool.qty <= EPS) {
      pool.qty = 0;
      pool.costUsd = 0;
      pool.costCad = 0;
    }

    const id = disposalId(e);
    const isTransfer = transferIds.has(id) || !!e.bridge;
    // the owner's own figure for what the uncovered units cost (CAD), entered on the row's label
    const override = qty - covered > 1e-12 ? costOverridesCad.get(id) : undefined;
    if (override !== undefined && Number.isFinite(override) && override >= 0) {
      costCad += override;
      if (rate) costUsd += override / rate;
    }
    const proceedsUsd = isTransfer ? costUsd : valueUsd;
    const proceedsCad = rate === null ? null : isTransfer ? costCad : valueUsd * rate;

    disposals.push({
      id,
      source: e.source,
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
      kind: e.bridge ? 'bridge' : LP_CONTRACTS.has(e.to.toLowerCase()) ? 'lp' : hasIn.has(e.hash) || e.market ? 'swap' : 'send',
      counterparty: e.to,
      costOverridden: override !== undefined,
    });
  }

  const holdings: AcbHolding[] = [...pools.entries()]
    .filter(([, p]) => p.qty > 1e-9)
    .map(([asset, p]) => ({ asset, quantity: p.qty, acbUsd: p.costUsd, acbCad: cadComplete ? p.costCad : null }))
    .sort((a, b) => b.acbUsd - a.acbUsd);

  return { disposals, income, receipts, holdings, stats };
}
