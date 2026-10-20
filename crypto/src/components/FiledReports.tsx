'use client';

import { useCallback, useEffect, useState } from 'react';
import { money } from '@/components/TaxSummary';
import { BASE_PATH } from '@/lib/basePath';

interface FiledEntry {
  id: string;
  year: number;
  savedAt: string;
  gainCad: number;
  incomeCad: number;
  rows: number;
  note: string;
}

/**
 * "Save this year's report as filed" + the saved copies, and "Download everything" (the whole stored
 * archive as one JSON file, put together here from /api/archive's parts). For a CRA review years
 * later: what the return was based on, frozen, plus every stored transaction and label.
 */
export default function FiledReports({ year }: { year: number }) {
  const [list, setList] = useState<FiledEntry[] | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${BASE_PATH}/api/taxes/filed`, { cache: 'no-store' });
    const json = (await res.json()) as { data?: FiledEntry[]; error?: string };
    setList(json.data ?? []);
    if (json.error) setMsg(json.error);
  }, []);

  useEffect(() => {
    load().catch(() => setList([]));
  }, [load]);

  async function save() {
    setBusy('save');
    setMsg(null);
    try {
      const res = await fetch(`${BASE_PATH}/api/taxes/filed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, note }),
      });
      const json = (await res.json()) as { data?: FiledEntry; error?: string };
      if (json.data) {
        setMsg(`Saved: ${year}, ${json.data.rows} rows, gain ${money(json.data.gainCad, 'CAD')}`);
        setNote('');
        await load();
      } else setMsg(json.error ?? 'Could not save');
    } finally {
      setBusy(null);
    }
  }

  async function downloadAll() {
    setBusy('all');
    setMsg('Putting the archive together…');
    try {
      const index = (await (await fetch(`${BASE_PATH}/api/archive`, { cache: 'no-store' })).json()) as {
        sources?: { id: string }[];
        error?: string;
      } & Record<string, unknown>;
      if (!index.sources) throw new Error(index.error ?? 'no archive');
      const parts = [];
      for (const s of index.sources) {
        setMsg(`Putting the archive together… ${s.id}`);
        parts.push(await (await fetch(`${BASE_PATH}/api/archive?source=${encodeURIComponent(s.id)}`, { cache: 'no-store' })).json());
      }
      const filed = [];
      for (const f of (index.filed as FiledEntry[] | undefined) ?? []) {
        filed.push(await (await fetch(`${BASE_PATH}/api/taxes/filed?id=${encodeURIComponent(f.id)}`, { cache: 'no-store' })).json());
      }
      const blob = new Blob([JSON.stringify({ ...index, sources: parts, filedReports: filed })], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `mes-finance-archive-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setMsg(`Downloaded (${(blob.size / 1e6).toFixed(1)} MB). Keep it somewhere safe, e.g. with your tax papers.`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'The download failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel flex flex-col gap-3 text-sm">
      <div>
        <p className="font-medium text-gray-200">Records for the CRA</p>
        <p className="text-xs text-gray-500">
          Every transaction is stored permanently and kept up to date by the sync. When you file, save the year&apos;s report here: a frozen
          copy of the exact rows, totals, labels and notes it was based on, kept even if anything changes later. &quot;Download everything&quot;
          gives you the whole archive (all stored transactions, labels, notes and saved reports) as one file to keep with your tax papers.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={`Note (e.g. "filed with my ${year} return")`}
          className="min-w-[14rem] flex-1 rounded-md border border-bg-border bg-bg px-2 py-1.5 text-gray-100"
        />
        <button
          type="button"
          onClick={save}
          disabled={!!busy}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-bg disabled:opacity-40"
        >
          {busy === 'save' ? 'Saving…' : `Save the ${year} report as filed`}
        </button>
        <button
          type="button"
          onClick={downloadAll}
          disabled={!!busy}
          className="rounded-md border border-bg-border px-3 py-1.5 text-sm text-gray-200 hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {busy === 'all' ? 'Preparing…' : 'Download everything'}
        </button>
      </div>
      {msg && <p className="text-xs text-gray-300">{msg}</p>}
      {list && list.length > 0 && (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Saved</th>
                <th>Gain / loss</th>
                <th>Income</th>
                <th>Rows</th>
                <th>Note</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {list.map((f) => (
                <tr key={f.id}>
                  <td>{f.year}</td>
                  <td className="whitespace-nowrap">{new Date(f.savedAt).toLocaleString()}</td>
                  <td>{money(f.gainCad, 'CAD')}</td>
                  <td>{money(f.incomeCad, 'CAD')}</td>
                  <td>{f.rows}</td>
                  <td className="text-xs text-gray-400">{f.note || '—'}</td>
                  <td className="whitespace-nowrap">
                    <a href={`${BASE_PATH}/api/taxes/filed?id=${encodeURIComponent(f.id)}&format=csv`} className="text-accent hover:underline">
                      CSV
                    </a>{' '}
                    ·{' '}
                    <a href={`${BASE_PATH}/api/taxes/filed?id=${encodeURIComponent(f.id)}`} className="text-accent hover:underline">
                      Full (JSON)
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
