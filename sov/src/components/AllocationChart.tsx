'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Holding } from '@/lib/types';

const COLORS = ['#f0b90b', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6', '#f97316', '#eab308'];

export default function AllocationChart({ holdings }: { holdings: Holding[] }) {
  const data = holdings
    .filter((h) => (h.valueUsd ?? 0) > 0)
    .map((h) => ({ name: h.token.symbol, value: h.valueUsd ?? 0 }));

  if (data.length === 0) {
    return <div className="panel flex h-64 items-center justify-center text-gray-500">No priced holdings yet</div>;
  }

  return (
    <div className="panel h-72">
      <p className="stat-label mb-2">Allocation</p>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            contentStyle={{ background: '#131722', border: '1px solid #232838', borderRadius: 8 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
