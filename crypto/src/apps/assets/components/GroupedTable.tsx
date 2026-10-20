'use client';

import { Fragment, useMemo, useState } from 'react';
import { SOURCE_LABELS } from '@/apps/assets/lib/constants';
import { amount, pct, price, usd } from '@/apps/assets/lib/format';
import type { AssetGroup } from '@/apps/assets/lib/assetGroups';
import type { GroupSummary, Holding } from '@/apps/assets/lib/types';
import { KIND_BADGE, KIND_LABELS } from './kinds';

const change = (v: number | null) => <span className={v === null ? 'text-gray-500' : v >= 0 ? 'text-gain' : 'text-loss'}>{pct(v)}</span>;

const ThinBadge = () => (
  <span
    title="Thin market: the best bid is far below the last trade, so this may not be sellable at this value"
    className="ml-2 rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wide text-yellow-300"
  >
    thin
  </span>
);

/**
 * The Assets table, one row per asset (BTC, ETH, HIVE, ...) with its total; click a row to see the forms
 * it is held in (BTCB on BNB Chain, SWAP.BTC on Hive Engine, native BTC...) and where.
 */
export default function GroupedTable({ groups, accounts }: { groups: AssetGroup[]; accounts: GroupSummary[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const accountLabel = useMemo(() => Object.fromEntries(accounts.map((g) => [g.key, g.label])), [accounts]);
  const total = groups.reduce((s, g) => s + g.valueUsd, 0);
  const multi = groups.filter((g) => g.holdings.length > 1);
  const allOpen = multi.length > 0 && multi.every((g) => open.has(g.key));

  const where = (h: Holding) => {
    const src = SOURCE_LABELS[h.source];
    const acct = accountLabel[h.group] ?? h.group;
    return acct && acct !== src ? `${src} · ${acct}` : src;
  };
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="stat-label">Assets</p>
        {multi.length > 0 && (
          <button type="button" onClick={() => setOpen(allOpen ? new Set() : new Set(multi.map((g) => g.key)))} className="text-xs text-accent hover:underline">
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[640px]">
          <thead>
            <tr>
              <th>Asset</th>
              <th className="text-right">Amount</th>
              <th className="text-right">Price</th>
              <th className="text-right">24h</th>
              <th className="text-right">Value</th>
              <th className="text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const several = g.holdings.length > 1;
              const isOpen = open.has(g.key);
              const only = g.holdings[0]!;
              return (
                <Fragment key={g.key}>
                  <tr className={several ? 'cursor-pointer hover:bg-white/[0.03]' : undefined} onClick={several ? () => toggle(g.key) : undefined}>
                    <td>
                      <div className="font-medium text-gray-100">
                        {several && <span className="mr-1.5 inline-block w-3 text-gray-500">{isOpen ? '▾' : '▸'}</span>}
                        {g.name}
                        {g.thin && <ThinBadge />}
                      </div>
                      <div className="text-xs text-gray-500">
                        {several ? `${g.holdings.length} places · ${g.kinds.map((k) => KIND_LABELS[k]).join(', ')}` : `${only.label ?? only.symbol} · ${where(only)}`}
                      </div>
                    </td>
                    <td className="text-right">{g.amount === null ? '—' : amount(g.amount)}</td>
                    <td className="text-right">{price(g.priceUsd)}</td>
                    <td className="text-right">{change(g.change24hPct)}</td>
                    <td className="text-right font-semibold text-gray-100">{usd(g.valueUsd)}</td>
                    <td className="text-right text-gray-500">{total > 0 ? ((g.valueUsd / total) * 100).toFixed(1) : '0.0'}%</td>
                  </tr>
                  {several &&
                    isOpen &&
                    g.holdings.map((h) => (
                      <tr key={h.id} className="bg-black/10 text-sm">
                        <td className="pl-8">
                          <div className="text-gray-200">
                            {h.label ?? h.symbol}
                            <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${KIND_BADGE[h.kind]}`}>{KIND_LABELS[h.kind]}</span>
                            {h.thin && <ThinBadge />}
                          </div>
                          <div className="text-xs text-gray-500">
                            {where(h)}
                            {h.lp && ` · ${h.lp.legs.map((l) => `${amount(l.amount)} ${l.symbol}`).join(' + ')}`}
                          </div>
                        </td>
                        <td className="text-right text-gray-300">{h.kind === 'lp' ? '—' : amount(h.amount)}</td>
                        <td className="text-right text-gray-400">{price(h.priceUsd)}</td>
                        <td className="text-right">{change(h.change24hPct)}</td>
                        <td className="text-right text-gray-200">{usd(h.valueUsd)}</td>
                        <td className="text-right text-gray-600">{total > 0 ? (((h.valueUsd ?? 0) / total) * 100).toFixed(1) : '0.0'}%</td>
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="text-right text-xs uppercase tracking-wide text-gray-500">
                Total
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
