import { getCadRates } from '../cadRate';
import { fetchAllSources } from '../combine';
import { listLabels } from '../labels';
import { isTransferLabel, type TaxRow, type TaxSourceStatus, type TaxYearSummary, type TaxesResponse } from '../types';
import { WALLET_LABELS, type WalletKey } from '../wallets';
import { computeAcb, disposalId, type AcbDisposal, type TaxEntry } from './acb';

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
  }[];
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
    uncoveredCount: taxable.filter((r) => r.uncoveredQuantity > 1e-9).length,
    byAsset: [...byAsset.values()].sort((a, b) => Math.abs(b.gainCad) - Math.abs(a.gainCad)),
  };
}

/**
 * The whole Taxes report: fetches every wallet's ledger, runs one ACB calculation across all of
 * them (acb.ts), then picks out one tax year's rows. Returns null only if no wallet at all could be
 * loaded. Shared by /api/taxes and /api/taxes/export so the page and the CSV always agree.
 */
export async function buildTaxReport(opts: { wallet?: WalletKey; year?: number }): Promise<TaxesResponse | null> {
  const [results, labels] = await Promise.all([fetchAllSources<UpstreamLedger>('/api/ledger'), listLabels()]);
  if (results.every((r) => r.data === null)) return null;

  const entries: TaxEntry[] = results.flatMap((r) =>
    (r.data?.entries ?? []).map((e) => ({
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
  );

  const sources: TaxSourceStatus[] = results.map((r) => ({
    key: r.source.key,
    label: r.source.label,
    entries: r.data?.entries.length ?? 0,
    error: r.error,
  }));

  const cadRatesRaw = await getCadRates(entries.map((e) => e.timestamp));
  const cadRates = new Map<string, number>();
  for (const [d, r] of cadRatesRaw) if (r !== null) cadRates.set(d, r);
  const cadComplete = [...cadRatesRaw.values()].every((r) => r !== null);

  const transferIds = new Set(
    entries.map(disposalId).filter((id) => isTransferLabel(labels[id])),
  );
  const { disposals, holdings, stats } = computeAcb(entries, cadRates, transferIds);

  const years = [...new Set(disposals.map((d) => d.taxYear))].sort((a, b) => b - a);
  const year = opts.year ?? years[0] ?? new Date().getUTCFullYear();
  const ofYear = disposals.filter((d) => d.taxYear === year);

  const rows: TaxRow[] = ofYear
    .filter((d) => !opts.wallet || d.wallet === opts.wallet)
    .sort((a, b) => new Date(b.disposedAt).getTime() - new Date(a.disposedAt).getTime())
    .map((d) => ({ ...d, walletLabel: WALLET_LABELS[d.wallet], label: labels[d.id] ?? null }));

  return {
    years,
    year,
    // the year's totals always cover every wallet - the wallet filter only narrows the list
    summary: summarize(year, ofYear),
    rows,
    holdings,
    stats,
    sources,
    cadComplete,
  };
}
