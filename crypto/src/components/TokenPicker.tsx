'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { money } from '@/components/TaxSummary';
import { SECTIONS, SECTION_LABELS, type Section } from '@/lib/sections';
import type { TaxTokenSummary } from '@/lib/types';

const SHORT: Record<Section, string> = { ai: 'AI', mfa: 'MikeFA', sov: 'SOV', lp: 'LP', cash: 'Cash', tokens: 'Tokens' };

/**
 * The Taxes page's token picker: every ACB pool (wrapped forms already lumped in, e.g. BTC = BTC +
 * BTCB + WBTC + SWAP.BTC), A-Z, with a search box, section chips and a "sold this year only" switch.
 * Keyboard: type to search, Up/Down to move, Enter to pick, Esc to close.
 */
export default function TokenPicker({
  tokens,
  year,
  value,
  onChange,
}: {
  tokens: TaxTokenSummary[];
  year: number;
  value?: string;
  onChange: (asset: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sec, setSec] = useState<Section | undefined>();
  const [soldOnly, setSoldOnly] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.filter(
      (t) =>
        (!sec || t.sections.includes(sec)) &&
        (!soldOnly || t.sales > 0) &&
        words.every((w) => t.asset.toLowerCase().includes(w) || t.sections.some((s) => SECTION_LABELS[s].toLowerCase().includes(w))),
    );
  }, [tokens, q, sec, soldOnly]);
  // index 0 = "All tokens", then the shown tokens
  const options: (string | undefined)[] = [undefined, ...shown.map((t) => t.asset)];

  useEffect(() => {
    if (!open) return;
    setHi(Math.max(0, options.indexOf(value)));
    setTimeout(() => input.current?.focus(), 0);
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => setHi((h) => Math.min(h, options.length - 1)), [options.length]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [hi]);

  const pick = (asset: string | undefined) => {
    onChange(asset);
    setOpen(false);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(options[hi]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };
  const usedSections = SECTIONS.filter((s) => tokens.some((t) => t.sections.includes(s)));
  const chip = (on: boolean) => `rounded px-2 py-0.5 text-xs ${on ? 'bg-accent text-bg' : 'border border-bg-border text-gray-300 hover:text-accent'}`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${value ? 'border-accent text-accent' : 'border-bg-border text-gray-200 hover:border-accent'}`}
      >
        Token: <strong>{value ?? 'All tokens'}</strong> <span aria-hidden>▾</span>
      </button>
      {value && (
        <button type="button" onClick={() => onChange(undefined)} className="absolute -right-6 top-1.5 text-sm text-gray-400 hover:text-accent" aria-label="Show every token">
          ✕
        </button>
      )}

      {open && (
        <div className="absolute left-0 z-30 mt-1 flex w-[min(92vw,26rem)] flex-col gap-2 rounded-md border border-bg-border bg-bg-panel p-3 shadow-xl" onKeyDown={onKey}>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHi(e.target.value ? 1 : 0);
            }}
            placeholder={`Search ${tokens.length} tokens…`}
            aria-label="Search tokens"
            className="rounded-md border border-bg-border bg-bg px-2 py-1.5 text-sm text-gray-100"
          />
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setSec(undefined)} className={chip(!sec)}>
              Every section
            </button>
            {usedSections.map((s) => (
              <button key={s} type="button" onClick={() => setSec(sec === s ? undefined : s)} className={chip(sec === s)}>
                {SECTION_LABELS[s]}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input type="checkbox" checked={soldOnly} onChange={(e) => setSoldOnly(e.target.checked)} />
            Only tokens sold or swapped in {year}
          </label>
          <ul ref={list} role="listbox" className="max-h-80 overflow-y-auto rounded-md border border-bg-border">
            {options.map((asset, i) => {
              const t = asset ? shown[i - 1] : undefined;
              return (
                <li
                  key={asset ?? '*'}
                  data-i={i}
                  role="option"
                  aria-selected={value === asset}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => pick(asset)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm ${i === hi ? 'bg-bg-border/70' : ''} ${value === asset ? 'text-accent' : 'text-gray-200'}`}
                >
                  {t ? (
                    <>
                      <span className="min-w-0">
                        <span className="font-medium">{t.asset}</span>{' '}
                        <span className="text-xs text-gray-500">{t.sections.map((s) => SHORT[s]).join(' · ')}</span>
                      </span>
                      <span className="whitespace-nowrap text-xs text-gray-400">
                        {t.sales > 0 ? (
                          <>
                            {t.sales} sale{t.sales === 1 ? '' : 's'} ·{' '}
                            <span className={t.gainCad >= 0 ? 'text-gain' : 'text-loss'}>{money(t.gainCad, 'CAD')}</span>
                          </>
                        ) : t.incomeCad > 0 ? (
                          'income only'
                        ) : (
                          'held, no sales'
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium">All tokens</span>
                  )}
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-2 text-sm text-gray-500">No token matches.</li>}
          </ul>
          <p className="text-xs text-gray-500">Wrapped forms count as the coin itself (BTCB and WBTC as BTC, WETH as ETH, WBNB as BNB).</p>
        </div>
      )}
    </div>
  );
}
