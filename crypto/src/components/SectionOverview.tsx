'use client';

import { useEffect, useState } from 'react';
import { money } from '@/components/TaxSummary';
import { SECTION_LABELS, SECTION_LINKS, type Section } from '@/lib/sections';
import type { TaxSectionSummary } from '@/lib/types';

const RATE_KEY = 'mes-taxes:rate';
const DEFAULT_RATE = 30;
const pct = (n: number) => `${n.toLocaleString('en-CA', { maximumFractionDigits: 2 })}%`;

/**
 * mes.fm/taxes' overview: how much of the year's capital gains and income comes from each portfolio
 * section, and a rough tax estimate at a marginal rate the owner types in (saved in this browser).
 * Canada: half of a net capital gain is taxable; crypto income counts in full. A section's loss offsets
 * another's gains; a net capital loss for the whole year can't lower other tax (it is carried over).
 */
export default function SectionOverview({
  year,
  sections,
  selected,
  onSelect,
}: {
  year: number;
  sections: TaxSectionSummary[];
  selected?: Section;
  onSelect: (s: Section | undefined) => void;
}) {
  const [rate, setRate] = useState(DEFAULT_RATE);
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(RATE_KEY));
      if (v > 0 && v < 100) setRate(v);
    } catch {
      /* storage blocked: keep the default */
    }
  }, []);
  const changeRate = (v: number) => {
    const r = Math.min(99, Math.max(0, Number.isFinite(v) ? v : 0));
    setRate(r);
    try {
      localStorage.setItem(RATE_KEY, String(r));
    } catch {
      /* ignore */
    }
  };

  // round away float dust (-0.000001 showed as -$0.00)
  const c = (n: number) => (Math.abs(n) < 0.005 ? 0 : n);
  const rows = sections.map((s) => ({ ...s, gainCad: c(s.gainCad), incomeCad: c(s.incomeCad), taxable: c(s.gainCad * 0.5 + s.incomeCad) }));
  const totalGain = rows.reduce((t, r) => t + r.gainCad, 0);
  const totalIncome = rows.reduce((t, r) => t + r.incomeCad, 0);
  const totalCount = rows.reduce((t, r) => t + r.count, 0);
  // the year as a whole: a net capital loss doesn't reduce income, so it counts as 0 here
  const taxableTotal = Math.max(0, totalGain) * 0.5 + totalIncome;
  const taxTotal = (taxableTotal * rate) / 100;
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.taxable)));

  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="stat-label">Overview by section, {year} (CAD) · estimate</p>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          Your marginal tax rate
          <input
            type="number"
            min={0}
            max={99}
            step={0.5}
            value={rate}
            onChange={(e) => changeRate(Number(e.target.value))}
            className="w-20 rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-right text-gray-100"
            aria-label="Marginal tax rate in percent"
          />
          %
        </label>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Section</th>
              <th>Sales</th>
              <th>Capital gain / loss</th>
              <th>Income</th>
              <th>Taxable (½ of gain + income)</th>
              <th>Tax at {pct(rate)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tax = c((r.taxable * rate) / 100);
              const on = selected === r.section;
              return (
                <tr
                  key={r.section}
                  onClick={() => onSelect(on ? undefined : r.section)}
                  className={`cursor-pointer hover:bg-bg-border/40 ${on ? 'bg-bg-border/60' : ''} ${r.count === 0 && r.incomeCad === 0 ? 'text-gray-500' : ''}`}
                  title={on ? 'Show every row again' : `Show only ${SECTION_LABELS[r.section]}'s rows below`}
                >
                  <td className="whitespace-nowrap">
                    <span className={`font-medium ${on ? 'text-accent' : 'text-gray-100'}`}>{SECTION_LABELS[r.section]}</span>
                    <a href={SECTION_LINKS[r.section]} onClick={(e) => e.stopPropagation()} className="ml-2 text-xs text-accent hover:underline">
                      page &rarr;
                    </a>
                  </td>
                  <td className="tabular-nums">{r.count}</td>
                  <td className={`tabular-nums ${r.gainCad > 0 ? 'text-gain' : r.gainCad < 0 ? 'text-loss' : ''}`}>{money(r.gainCad, 'CAD')}</td>
                  <td className="tabular-nums">{money(r.incomeCad, 'CAD')}</td>
                  <td className="tabular-nums">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="inline-block h-1.5 w-16 overflow-hidden rounded bg-bg-border/60">
                        <span
                          className={`block h-full ${r.taxable >= 0 ? 'bg-gain' : 'bg-loss'}`}
                          style={{ width: `${(Math.abs(r.taxable) / maxAbs) * 100}%` }}
                        />
                      </span>
                      {money(r.taxable, 'CAD')}
                    </span>
                  </td>
                  <td className={`whitespace-nowrap tabular-nums ${tax < 0 ? 'text-gain' : ''}`}>{tax < 0 ? `−${money(-tax, 'CAD')}` : money(tax, 'CAD')}</td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className="text-gray-100">All sections</td>
              <td className="tabular-nums">{totalCount}</td>
              <td className={`tabular-nums ${totalGain >= 0 ? 'text-gain' : 'text-loss'}`}>{money(totalGain, 'CAD')}</td>
              <td className="tabular-nums">{money(totalIncome, 'CAD')}</td>
              <td className="tabular-nums">{money(taxableTotal, 'CAD')}</td>
              <td className="tabular-nums text-gray-100">{money(taxTotal, 'CAD')}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        A rough estimate, not a bill: the tax on this crypto alone if every extra dollar is taxed at the rate you type (find yours on a {year}{' '}
        Canadian tax bracket table for your province; it&apos;s saved in this browser). Half of a net capital gain is taxable; income (Hive rewards,
        HBD interest, CAKE) counts in full. A section&apos;s loss lowers the tax on another&apos;s gains (shown as −).
        {totalGain < 0 && (
          <>
            {' '}
            This year is a <strong className="text-gray-300">net capital loss</strong> ({money(totalGain, 'CAD')}): it can&apos;t lower tax on
            your other income, so the total counts it as $0. It can be carried back 3 years or forward to future gains.
          </>
        )}{' '}
        Click a section to list only its rows below.
      </p>
    </div>
  );
}
