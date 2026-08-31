import type { GainResult, UnrealizedGain } from '@/lib/accounting/types';

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function GainsSummary({ realized, unrealized }: { realized: GainResult[]; unrealized: UnrealizedGain[] }) {
  const realizedTotal = realized.reduce((sum, g) => sum + g.gainUsd, 0);
  const shortTerm = realized.filter((g) => g.term === 'short').reduce((sum, g) => sum + g.gainUsd, 0);
  const longTerm = realized.filter((g) => g.term === 'long').reduce((sum, g) => sum + g.gainUsd, 0);
  const unrealizedTotal = unrealized.reduce((sum, g) => sum + g.gainUsd, 0);

  const cards = [
    { label: 'Realized Gain/Loss', value: realizedTotal },
    { label: 'Short-term Realized', value: shortTerm },
    { label: 'Long-term Realized', value: longTerm },
    { label: 'Unrealized Gain/Loss', value: unrealizedTotal },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="panel">
          <p className="stat-label">{c.label}</p>
          <p className={`mt-1 text-xl font-semibold ${c.value >= 0 ? 'text-gain' : 'text-loss'}`}>
            {formatUsd(c.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
