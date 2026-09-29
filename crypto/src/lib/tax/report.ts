import { getCadRates } from '../cadRate';
import { fetchAllSources } from '../combine';
import { listLabels } from '../labels';
import {
  isTransferLabel,
  type LabelRecord,
  type TaxIncomeSummary,
  type TaxReceiptsSummary,
  type TaxRow,
  type TaxSourceStatus,
  type TaxYearSummary,
  type TaxesResponse,
} from '../types';
import { computeAcb, disposalId, type AcbDisposal, type AcbIncome, type AcbReceipt, type TaxEntry } from './acb';
import { getBitcoinEntries } from './sources/bitcoin';
import { getHiveEntries } from './sources/hive';
import { groupOf, sourceLabel, sourceLink, type TaxGroup } from './taxSources';

/** What every source app's GET /api/ledger returns (ai/, mfa/, sov/ - see e.g. ai/src/app/api/ledger/route.ts) */
interface UpstreamLedger {
  wallet: string;
  entries: {
    hash: string;
    network: string;
    timestamp: string;
    token: { symbol: string };
    from: string;
    to: string;
    amount: number;
    priceUsd: number | null;
    /** sov's combined-BTC legs: the underlying token and chain, e.g. "BTCB · BNB Chain" */
    subLabel?: string;
  }[];
}

/**
 * sov's BTC legs on BNB Chain and Ethereum are the Main wallet's own BTCB/WBTC transfers, which the
 * Main wallet's ledger (ai/?wallet=main) already includes - keep only sov's Polygon WBTC, XRP and TGLD.
 */
function isDuplicateOfMain(sourceKey: string, e: UpstreamLedger['entries'][number]): boolean {
  return sourceKey === 'sov' && e.network === 'bitcoin' && !/polygon/i.test(e.subLabel ?? '');
}

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

function needsInput(d: AcbDisposal, label: LabelRecord | null): TaxRow['needsInput'] {
  const out: TaxRow['needsInput'] = [];
  if (d.kind === 'send' && !d.isTransfer && !label?.tag) out.push('send');
  if (d.uncoveredQuantity > 1e-9 && !d.costOverridden && !d.isTransfer) out.push('unknown-cost');
  return out;
}

/**
 * The whole Taxes report: every source's history (the ai/mfa/sov apps' /api/ledger, plus native
 * Bitcoin and the Hive accounts read here directly), one ACB calculation across all of them
 * (acb.ts), then one tax year's rows, income and receipts. Sources load independently - one being
 * down shows as an error on the page rather than blanking it; if none load, NoWalletLoadedError.
 * Shared by /api/taxes and /api/taxes/export so the page and the CSV always agree.
 */
export async function buildTaxReport(opts: { group?: TaxGroup; year?: number }): Promise<TaxesResponse> {
  const [upstream, bitcoin, hive, labels] = await Promise.all([
    fetchAllSources<UpstreamLedger>('/api/ledger'),
    getBitcoinEntries().then(
      (entries) => ({ entries, error: null as string | null }),
      (err: unknown) => ({ entries: [] as TaxEntry[], error: err instanceof Error ? err.message : 'failed to load' }),
    ),
    getHiveEntries().catch((err: unknown) => ({
      entries: [] as TaxEntry[],
      errors: [{ account: 'all accounts', error: err instanceof Error ? err.message : 'failed to load' }],
      counts: {} as Record<string, number>,
    })),
    listLabels(),
  ]);

  const entries: TaxEntry[] = [
    ...upstream.flatMap((r) =>
      (r.data?.entries ?? []).filter((e) => !isDuplicateOfMain(r.source.key, e)).map((e) => ({
        source: r.source.key,
        hash: e.hash,
        network: e.network,
        timestamp: e.timestamp,
        symbol: e.token.symbol,
        amount: e.amount,
        priceUsd: e.priceUsd,
        from: e.from,
        to: e.to,
      })),
    ),
    ...bitcoin.entries,
    ...hive.entries,
  ];

  const hiveBySource = new Map<string, number>();
  for (const e of hive.entries) hiveBySource.set(e.source, (hiveBySource.get(e.source) ?? 0) + 1);
  const sources: TaxSourceStatus[] = [
    ...upstream.map((r) => ({ key: r.source.key, label: r.source.label, entries: r.data?.entries.length ?? 0, error: r.error })),
    { key: 'bitcoin', label: 'Bitcoin', entries: bitcoin.entries.length, error: bitcoin.error },
    ...Object.keys(hive.counts).map((account) => ({
      key: `hive:${account}`,
      label: `Hive @${account}`,
      entries: hiveBySource.get(`hive:${account}`) ?? 0,
      error: null,
    })),
    ...hive.errors.map((e) => ({ key: `hive:${e.account}`, label: `Hive @${e.account}`, entries: 0, error: e.error })),
  ];
  if (entries.length === 0 && sources.every((s) => s.error)) {
    throw new NoWalletLoadedError(sources.map((s) => `${s.label}: ${s.error}`));
  }

  const cadRatesRaw = await getCadRates(entries.map((e) => e.timestamp));
  const cadRates = new Map<string, number>();
  for (const [d, r] of cadRatesRaw) if (r !== null) cadRates.set(d, r);
  const cadComplete = [...cadRatesRaw.values()].every((r) => r !== null);

  const ids = entries.map(disposalId);
  const transferIds = new Set(ids.filter((id) => isTransferLabel(labels[id])));
  const costOverrides = new Map<string, number>();
  for (const id of ids) {
    const c = labels[id]?.costCad;
    if (typeof c === 'number') costOverrides.set(id, c);
  }
  const { disposals, income, receipts, holdings, stats } = computeAcb(entries, cadRates, transferIds, costOverrides);

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
    sources,
    cadComplete,
  };
}
