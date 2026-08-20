'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PortfolioValuePoint } from '@/lib/types';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export default function PortfolioValueChart({ history }: { history: PortfolioValuePoint[] }) {
  if (history.length < 2) {
    return (
      <div className="panel flex h-64 items-center justify-center text-gray-500">
        Not enough combined transaction history yet to chart value over time
      </div>
    );
  }

  const data = history.map((p) => ({ ...p, timeMs: new Date(p.timestamp).getTime() }));

  return (
    <div className="panel h-64">
      <p className="stat-label mb-2">Combined Portfolio Value Over Time</p>
      <ResponsiveContainer width="100%" height="90%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0b90b" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#f0b90b" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="timeMs"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            stroke="#8a94a6"
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v: number) => formatUsd(v)}
            stroke="#8a94a6"
            tick={{ fontSize: 11 }}
            width={70}
          />
          <Tooltip
            labelFormatter={(ms: number) => new Date(ms).toLocaleString()}
            formatter={(value: number) => [formatUsd(value), 'Value']}
            contentStyle={{ background: '#131722', border: '1px solid #232838', borderRadius: 8 }}
          />
          <Area type="stepAfter" dataKey="totalValueUsd" stroke="#f0b90b" fill="url(#valueFill)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
