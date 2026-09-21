'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { usd } from '@/lib/format';
import { CHART_COLORS, KIND_LABELS } from './kinds';
import type { GroupSummary, Holding } from '@/lib/types';

function Donut({ title, data }: { title: string; data: { name: string; value: number }[] }) {
  if (data.length === 0) return <div className="panel flex h-64 items-center justify-center text-gray-500">Nothing to chart</div>;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="panel">
      <p className="stat-label mb-2">{title}</p>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="h-44 w-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none">
                {data.map((d, i) => (
                  <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => usd(v)} contentStyle={{ background: '#131722', border: '1px solid #232838', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="w-full min-w-0 text-sm">
          {data.slice(0, 8).map((d, i) => (
            <li key={d.name} className="flex items-center justify-between gap-2 py-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="truncate text-gray-300">{d.name}</span>
              </span>
              <span className="shrink-0 text-gray-400">{((d.value / total) * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Two donuts: where the money is (by owner) and what shape it is in (by asset type) */
export default function Breakdown({ holdings, groups }: { holdings: Holding[]; groups: GroupSummary[] }) {
  const byGroup = groups
    .map((g) => ({ name: g.label, value: holdings.filter((h) => h.group === g.key).reduce((s, h) => s + (h.valueUsd ?? 0), 0) }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  const kinds = new Map<string, number>();
  for (const h of holdings) kinds.set(KIND_LABELS[h.kind], (kinds.get(KIND_LABELS[h.kind]) ?? 0) + (h.valueUsd ?? 0));
  const byKind = [...kinds.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Donut title="By account" data={byGroup} />
      <Donut title="By type" data={byKind} />
    </div>
  );
}
