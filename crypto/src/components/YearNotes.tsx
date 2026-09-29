'use client';

import { useEffect, useState } from 'react';
import type { LabelRecord } from '@/lib/types';

interface Props {
  year: number;
  notes: LabelRecord | null;
  onSave: (record: Omit<LabelRecord, 'updatedAt'>) => Promise<void>;
}

/**
 * The owner's free-form notes for one tax year - what was sold where, which sends were their own,
 * what still needs checking - kept with the report (and printed at the bottom of the CSV export).
 * Stored like a row label, under id `year:<YYYY>`.
 */
export default function YearNotes({ year, notes, onSave }: Props) {
  const [text, setText] = useState(notes?.notes ?? '');
  const [links, setLinks] = useState((notes?.screenshotUrls ?? []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // another year picked (or fresh data): show what's stored for it
  useEffect(() => {
    setText(notes?.notes ?? '');
    setLinks((notes?.screenshotUrls ?? []).join('\n'));
    setSaved(false);
  }, [year, notes?.updatedAt]);

  const dirty = text !== (notes?.notes ?? '') || links !== (notes?.screenshotUrls ?? []).join('\n');

  async function save() {
    setSaving(true);
    try {
      await onSave({
        tag: 'Year notes',
        notes: text,
        screenshotUrls: links
          .split(/\s+/)
          .map((u) => u.trim())
          .filter(Boolean),
        costCad: null,
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel flex flex-col gap-2 text-sm">
      <p className="font-medium text-gray-200">Your notes for {year}</p>
      <p className="text-xs text-gray-500">
        Anything worth remembering for this year&apos;s return: which sends were your own wallets, what you sold on SimpleSwap, costs you still need
        to look up, what your accountant said... Only you see these; they&apos;re also printed at the bottom of the CSV export. Notes on a single
        transaction go on its row (the Label button).
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        rows={5}
        placeholder={`e.g. 2026-08-25 ETH to 0x27bf... is my Bybit deposit wallet`}
        className="w-full rounded-md border border-bg-border bg-bg px-2 py-1.5 text-gray-100"
      />
      <input
        value={links}
        onChange={(e) => {
          setLinks(e.target.value);
          setSaved(false);
        }}
        placeholder="Links (receipts, screenshots, exchange statements) - separate with spaces"
        className="w-full rounded-md border border-bg-border bg-bg px-2 py-1.5 text-gray-100"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-bg disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save notes'}
        </button>
        {saved && !dirty && <span className="text-xs text-gain">Saved</span>}
        {notes?.updatedAt && !saved && (
          <span className="text-xs text-gray-500">Last saved {new Date(notes.updatedAt).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
