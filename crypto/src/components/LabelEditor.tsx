'use client';

import { useState } from 'react';
import type { LabelRecord } from '@/lib/types';

const PRESETS = ['Trade', 'Payment', 'Gift', 'Personal transfer', 'Income', 'Other'];

interface LabelEditorProps {
  initial: LabelRecord | null;
  /** Taxes rows: units whose cost the history doesn't show - enables the "what they cost you" field */
  uncoveredQuantity?: number;
  symbol?: string;
  onSave: (record: Omit<LabelRecord, 'updatedAt'>) => Promise<void>;
  onCancel: () => void;
}

/** Inline editor for one row's tag/notes/screenshot links - the actual Excel replacement. Opens
 * under the row it belongs to (see TaxesTable.tsx), never navigates away. */
export default function LabelEditor({ initial, uncoveredQuantity = 0, symbol, onSave, onCancel }: LabelEditorProps) {
  const [tag, setTag] = useState(initial?.tag ?? '');
  const [costCad, setCostCad] = useState(initial?.costCad != null ? String(initial.costCad) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>(initial?.screenshotUrls ?? []);
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);

  function addUrl() {
    const trimmed = newUrl.trim();
    if (!trimmed) return;
    setScreenshotUrls((prev) => [...prev, trimmed]);
    setNewUrl('');
  }

  async function save() {
    setSaving(true);
    try {
      const cost = costCad.trim() === '' ? null : Number(costCad.replace(/[$,\s]/g, ''));
      await onSave({ tag, notes, screenshotUrls, costCad: cost !== null && Number.isFinite(cost) && cost >= 0 ? cost : null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-bg-border bg-bg p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="stat-label">Label</span>
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setTag(p)}
            title={
              p === 'Personal transfer'
                ? 'Sent to another account of yours (e.g. your exchange account): not a sale, so no gain or loss is counted'
                : undefined
            }
            className={`rounded-full border px-2.5 py-1 text-xs ${
              tag === p ? 'border-accent bg-accent/20 text-accent' : 'border-bg-border text-gray-300 hover:border-accent'
            }`}
          >
            {p}
          </button>
        ))}
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Custom label"
          className="min-w-[10rem] flex-1 rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-gray-100"
        />
      </div>
      <p className="-mt-1 text-xs text-gray-500">
        <strong className="text-gray-400">Personal transfer</strong> = it went to another account of yours (e.g. your exchange account), so it
        isn&apos;t a sale and no gain or loss is counted. Every other label is a note for your records - the row still counts as a sale.
      </p>

      {uncoveredQuantity > 0 && (
        <label className="flex flex-col gap-1">
          <span className="stat-label">
            What the {uncoveredQuantity.toLocaleString('en-US', { maximumFractionDigits: 8 })} {symbol} with unknown cost cost you (CAD)
          </span>
          <input
            value={costCad}
            onChange={(e) => setCostCad(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 250.00 - leave empty to keep $0"
            className="w-60 rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-gray-100"
          />
          <span className="text-xs text-gray-500">
            From your exchange records or old receipts. Total for these units, not per unit. Left empty, they count at $0 cost.
          </span>
        </label>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes for your own records"
        rows={2}
        className="w-full rounded-md border border-bg-border bg-bg-panel px-2 py-1.5 text-gray-100"
      />

      <div className="flex flex-col gap-1.5">
        <span className="stat-label">Screenshot links</span>
        {screenshotUrls.map((url, i) => (
          <div key={`${url}-${i}`} className="flex items-center gap-2">
            <a href={url} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-accent hover:underline">
              {url}
            </a>
            <button
              type="button"
              onClick={() => setScreenshotUrls((prev) => prev.filter((_, j) => j !== i))}
              className="text-xs text-loss hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())}
            placeholder="https://..."
            className="min-w-0 flex-1 rounded-md border border-bg-border bg-bg-panel px-2 py-1 text-gray-100"
          />
          <button type="button" onClick={addUrl} className="rounded-md border border-bg-border px-2 py-1 text-xs hover:border-accent">
            Add
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-bg-border px-3 py-1.5 text-gray-300 hover:border-accent">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-accent px-3 py-1.5 font-medium text-bg disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
