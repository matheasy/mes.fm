'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { usd } from '@/apps/assets/lib/format';
import { CHART_COLORS, KIND_LABELS } from './kinds';
import type { AssetGroup } from '@/apps/assets/lib/assetGroups';
import type { Holding } from '@/apps/assets/lib/types';

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
              <Tooltip formatter={(v: number) => usd(v)} contentStyle={{ background: 'rgb(var(--c-panel))', border: '1px solid rgb(var(--c-border))', borderRadius: 8, color: 'rgb(var(--g-100))' }} itemStyle={{ color: 'rgb(var(--g-100))' }} labelStyle={{ color: 'rgb(var(--g-300))' }} />
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

/** Two donuts: which assets (wrapped forms counted with their asset, as in the table) and what shape they are in */
export default function Breakdown({ holdings, assets }: { holdings: Holding[]; assets: AssetGroup[] }) {
  // assets under 2% of the total become one "Other" slice (no slivers, and fewer slices than colours)
  const sum = assets.reduce((s, g) => s + g.valueUsd, 0);
  const big = assets.filter((g) => g.valueUsd > 0 && g.valueUsd >= sum * 0.02);
  const rest = assets.filter((g) => g.valueUsd > 0 && g.valueUsd < sum * 0.02).reduce((s, g) => s + g.valueUsd, 0);
  const byAsset = [...big.map((g) => ({ name: g.name, value: g.valueUsd })), ...(rest > 0 ? [{ name: 'Other', value: rest }] : [])];

  const kinds = new Map<string, number>();
  for (const h of holdings) kinds.set(KIND_LABELS[h.kind], (kinds.get(KIND_LABELS[h.kind]) ?? 0) + (h.valueUsd ?? 0));
  const byKind = [...kinds.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Donut title="By asset" data={byAsset} />
      <Donut title="By type" data={byKind} />
    </div>
  );
}
