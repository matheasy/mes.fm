import { getCadRates } from '../cadRate';
import { listLabels } from '../labels';
import { redisClient } from '../cache';
import { CHECKS_KEY } from '../store/ledgerStore';
import { readStoredLedger, storeStatusLines } from '../store/read';
import type { StoreChecks } from '../store/sync';
import {
  custodyLabelId,
  isTransferLabel,
  NOT_ROUND_TRIP,
  type LabelRecord,
  type TaxIncomeSummary,
  type TaxReceiptsSummary,
  type TaxRow,
  type TaxSourceStatus,
  type TaxYearSummary,
  type TaxesResponse,
  yearNotesId,
} from '../types';
import { computeAcb, custodyKey, disposalId, type AcbDisposal, type AcbIncome, type AcbReceipt, type TaxEntry } from './acb';
import { assetKey } from './assetKey';
import { contractsAmong, EVM_NETWORKS } from './contracts';
import { isLpContract } from '../lp';
import { isOwnAddress, isOwnExchangeDeposit } from './ownAddresses';
import { groupOf, sourceLabel, sourceLink, type TaxGroup } from './taxSources';

/** Every source failed to load - carries each one's reason so the page can say which and why */
export class NoWalletLoadedError extends Error {
  constructor(readonly reasons: string[]) {
    super(`No wallet could be loaded. ${reasons.join(' · ')}`);
  }
}

function summarize(year: number, rows: AcbDisposal[]): TaxYearSummary {
  const taxable = rows.filter((r) => !r.isTransfer);
  const byAsset = new Map<string, TaxYearSummary['byAsset'][number]>();
  const sum = { proceedsCad: 0, costCad: 0, gainCad: 0, proceedsUsd: 0, costUsd: 0, gainUsd: 0 };

  for (const r of taxable) {
    sum.proceedsCad += r.proceedsCad ?? 0;
    sum.costCad += r.costCad ?? 0;
    sum.gainCad += r.gainCad ?? 0;
    sum.proceedsUsd += r.proceedsUsd;
    sum.costUsd += r.costUsd;
    sum.gainUsd += r.gainUsd;
    const a = byAsset.get(r.asset) ?? { asset: r.asset, count: 0, quantity: 0, proceedsCad: 0, costCad: 0, gainCad: 0 };
    a.count += 1;
    a.quantity += r.quantity;
    a.proceedsCad += r.proceedsCad ?? 0;
    a.costCad += r.costCad ?? 0;
    a.gainCad += r.gainCad ?? 0;
    byAsset.set(r.asset, a);
  }

  return {
    year,
    count: taxable.length,
    ...sum,
    uncoveredCount: taxable.filter((r) => r.uncoveredQuantity > 1e-9 && !r.costOverridden).length,
    // proceeds of the units counted at $0 cost = how much of the gain rests on that assumption
    zeroCostGainCad: taxable
      .filter((r) => r.uncoveredQuantity > 1e-9 && !r.costOverridden && r.cadRate !== null)
      .reduce((s, r) => s + r.uncoveredQuantity * r.priceUsd * (r.cadRate ?? 0), 0),
    byAsset: [...byAsset.values()].sort((a, b) => Math.abs(b.gainCad) - Math.abs(a.gainCad)),
  };
}

function summarizeIncome(items: AcbIncome[]): TaxIncomeSummary {
  const byKind = new Map<string, TaxIncomeSummary['byKind'][number]>();
  let totalCad = 0;
  let totalUsd = 0;
  for (const i of items) {
    totalCad += i.cad ?? 0;
    totalUsd += i.usd;
    const k = `${i.kind}|${i.asset}`;
    const e = byKind.get(k) ?? { kind: i.kind, asset: i.asset, count: 0, quantity: 0, cad: 0, usd: 0 };
    e.count += 1;
    e.quantity += i.quantity;
    e.cad += i.cad ?? 0;
    e.usd += i.usd;
    byKind.set(k, e);
  }
  return { totalCad, totalUsd, byKind: [...byKind.values()].sort((a, b) => b.cad - a.cad) };
}

function summarizeReceipts(items: AcbReceipt[]): TaxReceiptsSummary {
  const bySender = new Map<string, TaxReceiptsSummary['bySender'][number]>();
  let totalCad = 0;
  for (const r of items) {
    if (r.fromLp) continue; // an LP withdrawal is the owner's own coins coming back, not income
    totalCad += r.cad ?? 0;
    const k = `${r.counterparty}|${r.source}|${r.asset}`;
    const e = bySender.get(k) ?? { counterparty: r.counterparty, source: r.source, asset: r.asset, count: 0, cad: 0 };
    e.count += 1;
    e.cad += r.cad ?? 0;
    bySender.set(k, e);
  }
  return { totalCad, bySender: [...bySender.values()].sort((a, b) => b.cad - a.cad) };
}

/**
 * Round-trip candidates: EVM addresses the owner both sent a coin to and got the same coin back from
 * (not their own, not the PancakeSwap LP contracts), confirmed to be smart contracts - a person's or
 * an exchange's wallet is left alone, since the owner may have sold in between (see AcbCustody).
 */
async function findCustodyContracts(entries: TaxEntry[]): Promise<{ found: Set<string>; failed: string[] }> {
  const seen = new Map<string, { network: string; address: string; out: boolean; in: boolean }>();
  for (const e of entries) {
    if (!EVM_NETWORKS.has(e.network) || e.income || e.amount === 0) continue;
    const cp = e.amount > 0 ? e.from : e.to;
    if (!cp || isOwnAddress(cp) || isLpContract(cp)) continue;
    const k = `${custodyKey(e.network, cp)}|${assetKey(e.symbol)}`;
    const s = seen.get(k) ?? { network: e.network, address: cp.toLowerCase(), out: false, in: false };
    if (e.amount < 0) s.out = true;
    else s.in = true;
    seen.set(k, s);
  }
  const both = [...seen.values()].filter((s) => s.out && s.in);
  return contractsAmong(both.map((s) => ({ network: s.network, address: s.address })));
}

function needsInput(d: AcbDisposal, label: LabelRecord | null): TaxRow['needsInput'] {
  const out: TaxRow['needsInput'] = [];
  if (d.kind === 'send' && !d.isTransfer && !label?.tag) out.push('send');
  if (d.uncoveredQuantity > 1e-9 && !d.costOverridden && !d.isTransfer) out.push('unknown-cost');
  return out;
}

/**
 * The whole Taxes report: every stored transaction (lib/store - the permanent copy that the sync keeps
 * up to date; no outside API is asked here), one ACB calculation across all of them (acb.ts), then one
 * tax year's rows, income and receipts. A source that was never stored shows as an error (and the CSV
 * export refuses); one whose last update failed is used as stored, with a note. If nothing is stored at
 * all, NoWalletLoadedError. Shared by /api/taxes, /api/taxes/export and the "filed" snapshots, so they
 * always agree.
 */
const PEG_NETWORKS: Record<NonNullable<TaxEntry['peg']>, (network: string) => boolean> = {
  hive: (n) => n === 'hive',
  bitcoin: (n) => n === 'bitcoin-l1',
  ethereum: (n) => n === 'ethereum',
};
/** How long a gateway may take to deliver, and how much of the coin it may keep as its fee */
const PEG_WINDOW_MS = 3 * 86_400_000;
const PEG_MAX_FEE = 0.05;

/**
 * Pairs every Hive Engine peg deposit/withdrawal (TaxEntry.peg) with the same coin's other side on its
 * own chain - HIVE sent to honey-swap with the SWAP.HIVE it became, SWAP.BTC withdrawn to the owner's
 * BTC address with the BTC that arrived - by giving both legs one hash: the calculation then nets them
 * to the gateway's fee, which leaves at cost (bridge). The other side is the closest leg in time, in
 * the right direction (sent before a deposit / received after a withdrawal, within 3 days), of the
 * same ACB pool and no more than 5% apart; the Hive side of a honey-swap deposit shares the
 * transaction id, so it's matched exactly. Unpaired legs keep their bridge treatment. Mutates `entries`.
 */
function pairPegMoves(entries: TaxEntry[]): void {
  const used = new Set<TaxEntry>();
  const pegs = entries.filter((e) => e.peg).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (const a of pegs) {
    const onChain = PEG_NETWORKS[a.peg!];
    const pool = assetKey(a.symbol);
    const t = Date.parse(a.timestamp);
    const deposit = a.amount > 0;
    const candidates = entries.filter((b) => {
      if (b.peg || used.has(b) || !onChain(b.network) || assetKey(b.symbol) !== pool) return false;
      if (Math.sign(b.amount) !== -Math.sign(a.amount)) return false;
      const dt = Date.parse(b.timestamp) - t;
      if (deposit ? dt > 60_000 || dt < -PEG_WINDOW_MS : dt < -60_000 || dt > PEG_WINDOW_MS) return false;
      const sent = Math.abs(deposit ? b.amount : a.amount);
      const got = Math.abs(deposit ? a.amount : b.amount);
      return got <= sent * 1.000001 && got >= sent * (1 - PEG_MAX_FEE);
    });
    const exact = candidates.find((b) => b.hash.split(':')[0] === a.hash);
    const best = exact ?? candidates.sort((x, y) => Math.abs(Date.parse(x.timestamp) - t) - Math.abs(Date.parse(y.timestamp) - t))[0];
    if (!best) continue;
    used.add(best);
    best.hash = a.hash;
    best.bridge = true;
  }
}

/**
 * The stored rows in the order the live report used to receive them: each EVM wallet's ledger (all its
 * networks, oldest first - what /api/ledger returned), then Bitcoin, XRP, TGLD, Hive Engine and the Hive
 * accounts. The calculation sorts by time anyway; this only keeps exact ties resolved the same way.
 */
function inReportOrder(bySource: Record<string, TaxEntry[]>): TaxEntry[] {
  const ids = Object.keys(bySource);
  const out: TaxEntry[] = [];
  for (const w of ['main', 'ai', 'mfa']) {
    const legs = ids.filter((id) => id.startsWith(`evm:${w}:`)).flatMap((id) => bySource[id]!);
    out.push(...legs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
  }
  for (const id of ['bitcoin', 'xrp', 'tgld', 'hive-engine']) out.push(...(bySource[id] ?? []));
  for (const id of ids.filter((x) => x.startsWith('hive:'))) out.push(...bySource[id]!);
  return out;
}

export async function buildTaxReport(opts: { group?: TaxGroup; year?: number }): Promise<TaxesResponse> {
  const redis = redisClient();
  const [stored, labels, checks] = await Promise.all([
    readStoredLedger(),
    listLabels(),
    redis ? redis.get<StoreChecks>(CHECKS_KEY).catch(() => null) : Promise.resolve(null),
  ]);
  const entries = inReportOrder(stored.taxBySource);
  pairPegMoves(entries);

  const sources: TaxSourceStatus[] = storeStatusLines(stored.metas);
  if (entries.length === 0) {
    throw new NoWalletLoadedError(sources.filter((s) => s.error).map((s) => `${s.label}: ${s.error}`));
  }

  const cadRatesRaw = await getCadRates(entries.map((e) => e.timestamp));
  const cadRates = new Map<string, number>();
  for (const [d, r] of cadRatesRaw) if (r !== null) cadRates.set(d, r);
  const cadComplete = [...cadRatesRaw.values()].every((r) => r !== null);

  const ids = entries.map(disposalId);
  // personal transfers: labelled so, or sent to one of the owner's own exchange deposit addresses
  const transferIds = new Set(ids.filter((id) => isTransferLabel(labels[id])));
  for (const e of entries) if (e.amount < 0 && isOwnExchangeDeposit(e.to)) transferIds.add(disposalId(e));
  const costOverrides = new Map<string, number>();
  for (const id of ids) {
    const c = labels[id]?.costCad;
    if (typeof c === 'number') costOverrides.set(id, c);
  }
  // detected round-trip contracts, minus any the owner switched off on the Taxes page
  // SWAP.HIVE counted on Hive Engine but no longer there: spent in a way not tracked yet - say so
  // (worked out by the sync, which has the live Hive Engine balance)
  for (const g of checks?.hiveGaps ?? [])
    sources.push({
      key: `check:hive-engine:${g.account}`,
      label: `Hive Engine @${g.account}`,
      entries: 0,
      error: `${g.missing.toLocaleString('en-US', { maximumFractionDigits: 0 })} SWAP.HIVE counted as still held left the account through trades not tracked yet (a token not on the list, liquidity added to a pool...). They stay in the HIVE pool, lowering its average cost a little; tell me which token and it gets added`,
    });
  const { found: detected, failed: uncheckedNetworks } = await findCustodyContracts(entries);
  for (const network of uncheckedNetworks)
    sources.push({
      key: `check:contracts:${network}`,
      label: `Round-trip check (${network})`,
      entries: 0,
      error: `couldn't ask the ${network} network which addresses are contracts, so some round trips there count as sales for now - reload the page in a minute`,
    });
  const disabled = new Set([...detected].filter((k) => {
    const [network, address] = k.split(':') as [string, string];
    return labels[custodyLabelId(network, address)]?.tag === NOT_ROUND_TRIP;
  }));
  const custodyContracts = new Set([...detected].filter((k) => !disabled.has(k)));
  const { disposals, income, receipts, custody, holdings, stats } = computeAcb(entries, cadRates, transferIds, costOverrides, custodyContracts);

  const years = [...new Set([...disposals, ...income].map((d) => d.taxYear))].sort((a, b) => b - a);
  const year = opts.year ?? years[0] ?? new Date().getUTCFullYear();
  const inGroup = (source: string) => !opts.group || groupOf(source) === opts.group;
  const ofYear = disposals.filter((d) => d.taxYear === year);

  const rows: TaxRow[] = ofYear
    .filter((d) => inGroup(d.source))
    .sort((a, b) => new Date(b.disposedAt).getTime() - new Date(a.disposedAt).getTime())
    .map((d) => {
      const label = labels[d.id] ?? null;
      return { ...d, sourceLabel: sourceLabel(d.source), sourceLink: sourceLink(d.source), label, needsInput: needsInput(d, label) };
    });

  return {
    years,
    year,
    // the year's totals always cover every source - the group filter only narrows the list
    summary: summarize(year, ofYear),
    rows,
    income: summarizeIncome(income.filter((i) => i.taxYear === year)),
    receipts: summarizeReceipts(receipts.filter((r) => r.taxYear === year)),
    needsInput: {
      sends: rows.filter((r) => r.needsInput.includes('send')).length,
      unknownCost: rows.filter((r) => r.needsInput.includes('unknown-cost')).length,
    },
    holdings,
    stats,
    // the ones in use, plus the switched-off ones (as zero rows) so they can be switched back on
    custody: [
      ...custody.map((c) => ({ ...c, disabled: false })),
      ...[...disabled].map((k) => {
        const [network, address] = k.split(':') as [string, string];
        return { network, address, asset: '—', matched: 0, notReturned: 0, extra: 0, disabled: true };
      }),
    ].sort((a, b) => a.network.localeCompare(b.network) || a.address.localeCompare(b.address) || a.asset.localeCompare(b.asset)),
    sources,
    cadComplete,
    yearNotes: labels[yearNotesId(year)] ?? null,
  };
}
