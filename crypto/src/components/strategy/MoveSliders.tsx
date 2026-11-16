'use client';

import { useState } from 'react';
import { BUCKET_LABEL, type Move, type Rec } from '@/lib/strategy/model';

/** A range slider with a gold tick at the recommended value, the value as a number box, and a "use" link */
export function RateSlider({
  label,
  value,
  rec,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  rec?: Rec;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const top = Math.max(max, value, rec?.pct ?? 0);
  const at = (v: number) => `${((v - min) / (top - min || 1)) * 100}%`;
  const off = rec && Math.abs(rec.pct - value) > step / 2;
  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-gray-300">{label}</span>
        <span className="flex items-center gap-1">
          <input
            type="number"
            className="w-20 rounded-md border border-bg-border bg-bg px-2 py-0.5 text-right text-sm tabular-nums text-gray-100 focus:border-accent focus:outline-none"
            min={min}
            max={top}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-label={`${label} (${suffix})`}
          />
          <span className="text-xs text-gray-400">{suffix}</span>
        </span>
      </div>
      <div className="relative py-1">
        <input
          type="range"
          min={min}
          max={top}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative z-10 w-full accent-[rgb(var(--c-accent))]"
          aria-label={label}
        />
        {rec && (
          <span
            className="pointer-events-none absolute top-0 z-0 h-full w-0.5 -translate-x-1/2 rounded bg-gain"
            style={{ left: `calc(8px + (100% - 16px) * ${(rec.pct - min) / (top - min || 1)})` }}
            title={`Recommended ${rec.pct}${suffix}`}
            aria-hidden="true"
          />
        )}
        <span className="sr-only">{at(value)}</span>
      </div>
      {rec && (
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="text-gain">
            ▍Recommended {rec.pct}
            {suffix}
          </span>
          {off ? (
            <button type="button" className="text-accent hover:underline" onClick={() => onChange(rec.pct)}>
              use it
            </button>
          ) : (
            <span className="text-gray-500">(you are on it)</span>
          )}
          <button type="button" className="text-gray-400 hover:text-accent" onClick={() => setShowWhy((o) => !o)} aria-expanded={showWhy}>
            {showWhy ? 'hide why' : 'why?'}
          </button>
        </div>
      )}
      {rec && showWhy && <p className="text-xs text-gray-400">{rec.why}</p>}
    </div>
  );
}

/** The % slider (and split slider) for one move */
export default function MoveSliders({ move, recs, onChange, compact }: { move: Move; recs: Record<string, Rec>; onChange: (patch: Partial<Move>) => void; compact?: boolean }) {
  if (move.kind !== 'pct' && !move.split) return compact ? <p className="text-xs text-gray-500">Takes all of the profit: no % to set.</p> : null;
  return (
    <div className={`flex flex-col gap-3 ${compact ? '' : 'rounded-lg border border-bg-border/70 p-3'}`}>
      {move.kind === 'pct' && (
        <RateSlider label={`% of ${BUCKET_LABEL[move.from]} each ${move.everyDays} days`} value={move.ratePct} rec={recs[move.id]} min={0} max={10} step={0.25} suffix="%" onChange={(v) => onChange({ ratePct: v })} />
      )}
      {move.split && (
        <RateSlider
          label={`Share to ${BUCKET_LABEL[move.split.to]} (rest to ${BUCKET_LABEL[move.to]})`}
          value={move.split.pct}
          rec={recs[`${move.id}:split`]}
          min={0}
          max={100}
          step={5}
          suffix="%"
          onChange={(v) => onChange({ split: { to: move.split!.to, pct: v } })}
        />
      )}
    </div>
  );
}
