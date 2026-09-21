import { cachedStale, cacheKey } from './cache';
import { DEFAULT_MIN_VALUE_USD, GROUPS, GROUP_BY_KEY, HIVE_ACCOUNT, TTL, type GroupConfig } from './config';
import { RateLimitError } from './errors';
import { fetchBlockscoutChain } from './sources/blockscout';
import { fetchBsc } from './sources/bsc';
import { fetchHiveEngine } from './sources/hiveEngine';
import { fetchHiveL1 } from './sources/hiveL1';
import { fetchHyperliquid } from './sources/hyperliquid';
import { fetchMagi } from './sources/magi';
import { fetchXrpl } from './sources/xrpl';
import type { AssetsSnapshot, GroupKey, GroupSummary, Holding, SourceId, SourceResult, SourceStatus } from './types';

/** Dispatches one (group, source) unit to the module that knows how to fetch it */
async function runUnit(group: GroupConfig, source: SourceId): Promise<SourceResult> {
  const addr = group.address ?? '';
  switch (source) {
    case 'hive-l1':
      return fetchHiveL1(HIVE_ACCOUNT);
    case 'hive-engine':
      return fetchHiveEngine(HIVE_ACCOUNT);
    case 'magi':
      return fetchMagi(HIVE_ACCOUNT);
    case 'ethereum':
    case 'arbitrum':
    case 'polygon':
    case 'base':
    case 'optimism':
      return fetchBlockscoutChain(source, addr);
    case 'bsc':
      return fetchBsc(addr);
    case 'hyperliquid':
      return fetchHyperliquid(addr);
    case 'xrpl':
      return fetchXrpl(addr);
  }
}

interface UnitOutcome {
  group: GroupConfig;
  source: SourceId;
  holdings: Holding[];
  status: SourceStatus;
}

async function loadUnit(group: GroupConfig, source: SourceId): Promise<UnitOutcome> {
  const key = cacheKey('unit', group.key, source);
  try {
    const r = await cachedStale(key, TTL.holdings, () => runUnit(group, source));
    const holdings: Holding[] = r.value.holdings.map((h, i) => ({
      ...h,
      group: group.key,
      source,
      id: `${group.key}:${source}:${h.kind}:${h.symbol}:${h.contract ?? h.label ?? ''}:${i}`,
    }));
    const stale = r.stale ? `showing last good data from ${new Date(r.fetchedAt).toISOString()} (refresh failed: ${r.error?.message})` : undefined;
    return {
      group,
      source,
      holdings,
      status: {
        group: group.key,
        source,
        ok: !r.stale,
        note: [r.value.note, stale].filter(Boolean).join('; ') || undefined,
        rateLimited: r.error instanceof RateLimitError || undefined,
        count: holdings.length,
        fetchedAt: new Date(r.fetchedAt).toISOString(),
      },
    };
  } catch (err) {
    return {
      group,
      source,
      holdings: [],
      status: {
        group: group.key,
        source,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        rateLimited: err instanceof RateLimitError,
        count: 0,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}

export interface SnapshotOptions {
  /** Only holdings worth at least this many USD are returned (0 = everything, dust included) */
  minValueUsd?: number;
  group?: GroupKey;
  source?: SourceId;
}

/**
 * The one entry point: loads every (group, source) unit in parallel - each read through Redis, so
 * an unexpired unit costs nothing upstream - then applies the display filters. Group summaries
 * always cover ALL groups so the UI's tabs keep their totals when one group is selected.
 */
export async function getSnapshot(opts: SnapshotOptions = {}): Promise<AssetsSnapshot> {
  const minValueUsd = opts.minValueUsd ?? DEFAULT_MIN_VALUE_USD;

  const units = GROUPS.flatMap((g) => g.sources.map((s) => ({ g, s })));
  const outcomes = await Promise.all(units.map(({ g, s }) => loadUnit(g, s)));

  const all = outcomes.flatMap((o) => o.holdings);

  const groups: GroupSummary[] = GROUPS.map((g) => {
    const mine = all.filter((h) => h.group === g.key);
    const shown = mine.filter((h) => (h.valueUsd ?? 0) >= minValueUsd);
    const hidden = mine.filter((h) => (h.valueUsd ?? 0) < minValueUsd);
    return {
      key: g.key,
      label: g.label,
      link: g.link,
      address: g.address,
      totalUsd: shown.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
      totalAllUsd: mine.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
      holdingCount: shown.length,
      hiddenCount: hidden.length,
      hiddenUsd: hidden.reduce((s, h) => s + (h.valueUsd ?? 0), 0),
    };
  });

  const holdings = all
    .filter((h) => (h.valueUsd ?? 0) >= minValueUsd)
    .filter((h) => !opts.group || h.group === opts.group)
    .filter((h) => !opts.source || h.source === opts.source)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));

  const fetchedTimes = outcomes.map((o) => Date.parse(o.status.fetchedAt)).filter(Number.isFinite);

  return {
    fetchedAt: new Date(fetchedTimes.length ? Math.max(...fetchedTimes) : Date.now()).toISOString(),
    minValueUsd,
    totalUsd: groups.reduce((s, g) => s + g.totalUsd, 0),
    totalAllUsd: groups.reduce((s, g) => s + g.totalAllUsd, 0),
    hiddenCount: groups.reduce((s, g) => s + g.hiddenCount, 0),
    hiddenUsd: groups.reduce((s, g) => s + g.hiddenUsd, 0),
    groups,
    holdings,
    sources: outcomes.map((o) => o.status),
  };
}

export { GROUP_BY_KEY };
