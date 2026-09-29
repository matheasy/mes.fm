import { cacheKey, getValue, setValue } from './cache';

/**
 * USD/CAD conversion for the Taxes page. CRA's own guidance (Income Tax Folio S5-F4-C1) is to
 * convert each transaction using the exchange rate in effect on that transaction's own date, not
 * one blended annual average - so a disposal's proceeds and its lots' cost basis are each
 * converted independently, using their own date. Rates come from the Bank of Canada's free,
 * keyless Valet API and are cached forever once resolved (a published historical rate never
 * changes), so a given date is only ever fetched from the Bank of Canada once, ever.
 */

const SERIES = 'FXUSDCAD';
const VALET_BASE = 'https://www.bankofcanada.ca/valet/observations';

interface ValetObservation {
  d: string; // YYYY-MM-DD
  [series: string]: { v: string } | string | undefined;
}

interface ValetResponse {
  observations?: ValetObservation[];
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(dateOnly: string, days: number): string {
  const d = new Date(`${dateOnly}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The Valet API 400s on a future date (it only publishes business days up to today) */
function clampToToday(dateOnly: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return dateOnly > today ? today : dateOnly;
}

async function fetchRange(startDate: string, endDate: string): Promise<Map<string, number>> {
  const url = `${VALET_BASE}/${SERIES}/json?start_date=${startDate}&end_date=${endDate}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Bank of Canada Valet API responded ${res.status}`);
  const json = (await res.json()) as ValetResponse;
  const out = new Map<string, number>();
  for (const obs of json.observations ?? []) {
    const cell = obs[SERIES];
    const raw = cell && typeof cell === 'object' ? cell.v : undefined;
    const value = raw !== undefined ? Number.parseFloat(raw) : NaN;
    if (Number.isFinite(value)) out.set(obs.d, value);
  }
  return out;
}

/**
 * Resolves the USD/CAD rate for each of `dates` (ISO datetimes or YYYY-MM-DD), using the rate
 * published on that exact day or, for a weekend/holiday, the closest preceding business day (the
 * Bank of Canada's own recommendation when no rate is quoted for a specific day). Returns `null`
 * for a date this couldn't resolve (Bank of Canada unreachable, or no rate within the lookback
 * window) rather than throwing, so one bad date doesn't blank the whole Taxes page.
 */
export async function getCadRates(dates: string[]): Promise<Map<string, number | null>> {
  const dateOnlySet = new Set(dates.map(toDateOnly).map(clampToToday));
  const result = new Map<string, number | null>();
  const uncached: string[] = [];

  for (const d of dateOnlySet) {
    const hit = await getValue<number>(cacheKey('cad-rate', d));
    if (hit !== null) result.set(d, hit);
    else uncached.push(d);
  }

  if (uncached.length > 0) {
    const sorted = [...uncached].sort();
    const rangeStart = addDays(sorted[0]!, -10); // lookback window for weekend/holiday fallback
    const rangeEnd = sorted[sorted.length - 1]!;
    let series: Map<string, number>;
    try {
      series = await fetchRange(rangeStart, rangeEnd);
    } catch {
      series = new Map();
    }

    for (const d of uncached) {
      let probe = d;
      let rate: number | null = null;
      for (let i = 0; i < 10; i++) {
        const found = series.get(probe);
        if (found !== undefined) {
          rate = found;
          break;
        }
        probe = addDays(probe, -1);
      }
      result.set(d, rate);
      if (rate !== null) await setValue(cacheKey('cad-rate', d), rate);
    }
  }

  return result;
}
