'use client';

import { useRef, useState } from 'react';
import { BUCKET_LABEL, BUCKETS, DEFAULT_NODES, type Bucket, type PlannedMove, type Settings } from '@/lib/strategy/model';

const usd0 = (v: number) => v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const COLOR: Record<Bucket, string> = { cash: '#22c55e', lp: '#3b82f6', tokens: '#a855f7', sov: '#f0b90b' };
const W = 600;
const H = 400;

interface Props {
  settings: Settings;
  totals: Record<Bucket, number>;
  all: number;
  planned: PlannedMove[];
  onChange: (d: Settings['diagram']) => void;
  onPickMove: (id: string) => void;
}

type Drag = { kind: 'node'; b: Bucket } | { kind: 'label'; id: string; sx: number; sy: number; dx: number; dy: number };

/** The cycle as a picture: drag a circle or a label to move it (saved); click a label to edit that move;
 * double-click the background to put everything back. */
export default function CycleDiagram({ settings, totals, all, planned, onChange, onPickMove }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [moved, setMoved] = useState(false);
  const d = settings.diagram;

  const pt = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const pos = (b: Bucket) => ({ x: (d.nodes[b].x / 100) * W, y: (d.nodes[b].y / 100) * H });
  const radius = (b: Bucket) => 28 + 32 * Math.sqrt(all > 0 ? totals[b] / all : 1 / 4);

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = pt(e);
    setMoved(true);
    if (drag.kind === 'node') {
      onChange({ ...d, nodes: { ...d.nodes, [drag.b]: { x: Math.min(95, Math.max(5, (p.x / W) * 100)), y: Math.min(92, Math.max(8, (p.y / H) * 100)) } } });
    } else {
      onChange({ ...d, labels: { ...d.labels, [drag.id]: { dx: drag.dx + p.x - drag.sx, dy: drag.dy + p.y - drag.sy } } });
    }
  };
  const end = () => setDrag(null);

  const moves = planned.length ? planned : [];
  // two moves between the same pair bend away from each other
  const pairCount = new Map<string, number>();

  return (
    <div className="panel">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="stat-label">Your cycle</p>
        <p className="text-xs text-gray-500">Drag circles and labels to arrange them · click a label to edit that move · double-click empty space to reset</p>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        style={{ maxHeight: 420 }}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerLeave={end}
        onDoubleClick={(e) => {
          if (e.target === svg.current) onChange({ nodes: { ...DEFAULT_NODES }, labels: {} });
        }}
        role="img"
        aria-label="Cycle of moves between Cash LP, Liquidity, Tokens and Store of Value"
      >
        <defs>
          {BUCKETS.map((b) => (
            <marker key={b} id={`arr-${b}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={COLOR[b]} />
            </marker>
          ))}
        </defs>
        {moves.flatMap((p) => [
          { p, to: p.move.to, main: true, share: 1 - (p.move.split ? p.move.split.pct / 100 : 0) },
          ...(p.move.split && p.move.split.pct > 0 ? [{ p, to: p.move.split.to, main: false, share: p.move.split.pct / 100 }] : []),
        ]).map(({ p, to, main, share }) => {
          const m = p.move;
          const a = pos(m.from);
          const b = pos(to);
          const key = [m.from, to].sort().join('-');
          const k = pairCount.get(key) ?? 0;
          pairCount.set(key, k + 1);
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const ra = radius(m.from) + 4;
          const rb = radius(to) + 8;
          const sx = a.x + ux * ra;
          const sy = a.y + uy * ra;
          const ex = b.x - ux * rb;
          const ey = b.y - uy * rb;
          const bend = 34 + k * 30;
          const cx = (sx + ex) / 2 - uy * bend;
          const cy = (sy + ey) / 2 + ux * bend;
          const lid = main ? m.id : `${m.id}:${to}`;
          const off = d.labels[lid] ?? { dx: 0, dy: 0 };
          const lx = (sx + 2 * cx + ex) / 4 + off.dx;
          const ly = (sy + 2 * cy + ey) / 4 + off.dy;
          const changed = Math.abs(p.mult - 1) > 0.02;
          const line1 = m.kind === 'profit' ? `profit every ${m.everyDays}d` : `${m.ratePct}% every ${m.everyDays}d${share < 1 ? ` · ${Math.round(share * 100)}%` : ''}`;
          const line2 = p.skipped ? 'skip this time' : `${usd0(p.usd * share)} now${changed ? ` (×${p.mult.toFixed(2)})` : ''}`;
          return (
            <g key={lid}>
              <path d={`M${sx},${sy} Q${cx},${cy} ${ex},${ey}`} fill="none" stroke={COLOR[to]} strokeWidth={2 + Math.min(4, p.mult * 1.5)} strokeOpacity={p.skipped ? 0.35 : 0.9} strokeDasharray={p.skipped ? '6 6' : undefined} markerEnd={`url(#arr-${to})`} />
              <g
                transform={`translate(${lx},${ly})`}
                className="cursor-grab"
                onPointerDown={(e) => {
                  (e.target as Element).setPointerCapture?.(e.pointerId);
                  const q = pt(e);
                  setMoved(false);
                  setDrag({ kind: 'label', id: lid, sx: q.x, sy: q.y, dx: off.dx, dy: off.dy });
                }}
                onClick={() => {
                  if (!moved) onPickMove(m.id);
                }}
              >
                <rect x={-74} y={-21} width={148} height={42} rx={8} fill="rgb(var(--c-panel))" stroke={COLOR[to]} strokeOpacity={0.7} />
                <text textAnchor="middle" y={-4} fontSize={13} fontWeight={600} fill="rgb(var(--g-100))">
                  {line1}
                </text>
                <text textAnchor="middle" y={13} fontSize={12} fill={p.skipped ? 'rgb(var(--g-500))' : 'rgb(var(--g-300))'}>
                  {line2}
                </text>
              </g>
            </g>
          );
        })}
        {BUCKETS.map((b) => {
          const p = pos(b);
          const r = radius(b);
          const pct = all > 0 ? (totals[b] / all) * 100 : 0;
          return (
            <g
              key={b}
              transform={`translate(${p.x},${p.y})`}
              className="cursor-grab"
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                setDrag({ kind: 'node', b });
              }}
            >
              <circle r={r} fill={COLOR[b]} fillOpacity={0.16} stroke={COLOR[b]} strokeWidth={2.5} />
              <text textAnchor="middle" y={-8} fontSize={14} fontWeight={700} fill="rgb(var(--g-100))">
                {BUCKET_LABEL[b]}
              </text>
              <text textAnchor="middle" y={10} fontSize={13} fill="rgb(var(--g-200))">
                {usd0(totals[b])}
              </text>
              <text textAnchor="middle" y={26} fontSize={12} fill="rgb(var(--g-400))">
                {pct.toFixed(1)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
