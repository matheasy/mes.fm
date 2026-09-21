'use client';

import { Fragment, useMemo, useState } from 'react';
import { SOURCE_LABELS } from '@/lib/constants';
import { amount, pct, price, usd } from '@/lib/format';
import type { AssetKind, GroupSummary, Holding } from '@/lib/types';
import { KIND_BADGE, KIND_LABELS } from './kinds';

type SortKey = 'value' | 'name' | 'change';

export default function HoldingsTable({ holdings, groups }: { holdings: Holding[]; groups: GroupSummary[] }) {
  const [kind, setKind] = useState<AssetKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('value');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groupLabel = useMemo(() => Object.fromEntries(groups.map((g) => [g.key, g.label])), [groups]);
  const kindsPresent = useMemo(() => [...new Set(holdings.map((h) => h.kind))], [holdings]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = holdings.filter(
      (h) =>
        (kind === 'all' || h.kind === kind) &&
        (!q || `${h.symbol} ${h.label ?? ''} ${h.contract ?? ''} ${h.detail ?? ''} ${SOURCE_LABELS[h.source]} ${groupLabel[h.group] ?? ''}`.toLowerCase().includes(q)),
    );
    return filtered.sort((a, b) => {
      if (sort === 'name') return (a.label ?? a.symbol).localeCompare(b.label ?? b.symbol);
      if (sort === 'change') return (b.change24hPct ?? -Infinity) - (a.change24hPct ?? -Infinity);
      return (b.valueUsd ?? 0) - (a.valueUsd ?? 0);
    });
  }, [holdings, kind, query, sort, groupLabel]);

  const total = rows.reduce((s, h) => s + (h.valueUsd ?? 0), 0);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const th = (label: string, key?: SortKey, right = false) => (
    <th className={right ? 'text-right' : undefined}>
      {key ? (
        <button onClick={() => setSort(key)} className={`uppercase tracking-wide hover:text-accent ${sort === key ? 'text-accent' : ''}`}>
          {label}
          {sort === key ? ' ↓' : ''}
        </button>
      ) : (
        label
      )}
    </th>
  );

  return (
    <div className="panel">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search assets, chains, accounts…"
          className="min-w-[14rem] flex-1 rounded-md border border-bg-border bg-transparent px-3 py-1.5 text-sm text-gray-100 placeholder:text-gray-600"
        />
        <div className="flex flex-wrap gap-1">
          {(['all', ...kindsPresent] as (AssetKind | 'all')[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${kind === k ? 'bg-accent font-medium text-black' : 'border border-bg-border text-gray-300 hover:text-accent'}`}
            >
              {k === 'all' ? 'All' : KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[760px]">
          <thead>
            <tr>
              {th('Asset', 'name')}
              <th>Where</th>
              <th>Type</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Price</th>
              {th('24h', 'change', true)}
              {th('Value', 'value', true)}
              <th className="text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((h) => {
              const expandable = Boolean(h.lp);
              const isOpen = open.has(h.id);
              return (
                <Fragment key={h.id}>
                  <tr className={expandable ? 'cursor-pointer hover:bg-white/[0.02]' : undefined} onClick={expandable ? () => toggle(h.id) : undefined}>
                    <td>
                      <div className="font-medium text-gray-100">
                        {expandable && <span className="mr-1 text-gray-500">{isOpen ? '▾' : '▸'}</span>}
                        {h.label ?? h.symbol}
                        {h.thin && (
                          <span title="Thin market: the best bid is far below the last trade, so this may not be sellable at this value" className="ml-2 rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-yellow-300">
                            thin
                          </span>
                        )}
                      </div>
                      {h.detail && <div className="max-w-[18rem] text-xs leading-snug text-gray-500">{h.detail}</div>}
                    </td>
                    <td className="whitespace-nowrap text-gray-400">
                      <div>{SOURCE_LABELS[h.source]}</div>
                      {(groupLabel[h.group] ?? h.group) !== SOURCE_LABELS[h.source] && <div className="text-xs text-gray-600">{groupLabel[h.group] ?? h.group}</div>}
                    </td>
                    <td>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] ${KIND_BADGE[h.kind]}`}>{KIND_LABELS[h.kind]}</span>
                    </td>
                    <td className="text-right">{h.kind === 'lp' ? <span className="text-gray-500">{amount(h.amount)} LP</span> : amount(h.amount)}</td>
                    <td className="text-right">{price(h.priceUsd)}</td>
                    <td className={`text-right ${h.change24hPct === null ? '' : h.change24hPct >= 0 ? 'text-gain' : 'text-loss'}`}>{pct(h.change24hPct)}</td>
                    <td className="text-right font-medium text-gray-100">{usd(h.valueUsd)}</td>
                    <td className="text-right text-gray-500">{total > 0 ? (((h.valueUsd ?? 0) / total) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                  {expandable && isOpen && h.lp && (
                    <tr>
                      <td colSpan={8} className="bg-black/20">
                        <div className="flex flex-wrap gap-x-8 gap-y-1 px-2 py-1 text-sm text-gray-300">
                          {h.lp.legs.map((l) => (
                            <span key={l.symbol}>
                              {amount(l.amount)} <span className="text-gray-100">{l.symbol}</span> <span className="text-gray-500">({usd(l.valueUsd)})</span>
                            </span>
                          ))}
                          {h.lp.share !== null && <span className="text-gray-500">{(h.lp.share * 100).toFixed(4)}% of the pool</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-gray-500">
                  No assets match.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6} className="text-right text-xs uppercase tracking-wide text-gray-500">
                {rows.length} assets
              </td>
              <td className="text-right font-semibold text-gray-100">{usd(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
