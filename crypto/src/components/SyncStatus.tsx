'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BASE_PATH } from '@/lib/basePath';

interface SourceMeta {
  id: string;
  label: string;
  syncedAt: string | null;
  error: string | null;
  held: { missing: number } | null;
  count: number;
  txCount: number;
}

interface Status {
  running: boolean;
  last: { startedAt: string; finishedAt: string | null; results: { id: string; added: number; error?: string }[] } | null;
  sources: SourceMeta[];
  missing: string[];
  oldestSyncedAt: string | null;
}

/** Older than this, opening a page starts a sync in the background by itself */
const AUTO_AFTER_MS = 6 * 3600_000;

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 48 * 3600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/**
 * "Transactions last synced 3 h ago · Sync now" - the permanent store's freshness, on every page that
 * reads it. Calls `onSynced` after a sync so the page reloads its data.
 */
export default function SyncStatus({ onSynced }: { onSynced?: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const autoTried = useRef(false);
  // the page's reload function changes every render: keep the latest in a ref so the effects below run once
  const syncedRef = useRef(onSynced);
  syncedRef.current = onSynced;

  const load = useCallback(async () => {
    const res = await fetch(`${BASE_PATH}/api/sync`, { cache: 'no-store' });
    const json = (await res.json()) as { data?: { status: Status } };
    if (json.data) setStatus(json.data.status);
    return json.data?.status ?? null;
  }, []);

  const sync = useCallback(
    async (trigger: 'auto' | 'button') => {
      setSyncing(true);
      setMessage(null);
      try {
        const res = await fetch(`${BASE_PATH}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger }),
        });
        const json = (await res.json()) as { data?: { started: boolean; reason?: string; status: Status }; error?: string };
        if (json.data) {
          setStatus(json.data.status);
          const added = json.data.status.last?.results.reduce((s, r) => s + r.added, 0) ?? 0;
          if (json.data.started) setMessage(added ? `${added} new transaction rows stored` : 'Up to date - nothing new');
          else if (json.data.reason) setMessage(json.data.reason);
          syncedRef.current?.();
        } else setMessage(json.error ?? 'The sync failed');
      } catch {
        setMessage('The sync did not answer - try again in a minute');
      } finally {
        setSyncing(false);
      }
    },
    [],
  );

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const s = await load().catch(() => null);
      if (stop || !s) return;
      if (s.running) {
        // someone else's sync (the daily one, another tab): wait for it, then reload the page's data
        timer = setTimeout(async () => {
          const after = await load().catch(() => null);
          if (after && !after.running) syncedRef.current?.();
          if (!stop) tick();
        }, 10_000);
        return;
      }
      const old = !s.oldestSyncedAt || Date.now() - Date.parse(s.oldestSyncedAt) > AUTO_AFTER_MS;
      if (old && !autoTried.current) {
        autoTried.current = true;
        sync('auto');
      }
    };
    tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [load, sync]);

  const issues = status ? status.sources.filter((m) => m.error || m.held) : [];
  const stored = status ? status.sources.reduce((s, m) => s + m.count, 0) : 0;
  const busy = syncing || !!status?.running;

  return (
    <div className="flex flex-col gap-1 text-xs text-gray-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          {busy ? (
            <strong className="text-gray-200">Syncing new transactions… (about a minute)</strong>
          ) : status?.missing.length ? (
            <strong className="text-yellow-300">Not all wallets are stored yet - the first sync takes a minute or two</strong>
          ) : (
            <>
              Transactions last synced <strong className="text-gray-200">{ago(status?.oldestSyncedAt ?? null)}</strong>
              {status?.oldestSyncedAt && <span className="text-gray-500"> ({new Date(status.oldestSyncedAt).toLocaleString()})</span>}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => sync('button')}
          disabled={busy}
          className="rounded-md border border-bg-border px-2.5 py-1 text-xs text-gray-200 hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        {status && (
          <button type="button" onClick={() => setOpen(!open)} className="text-gray-500 underline-offset-2 hover:text-accent hover:underline">
            {issues.length ? `${issues.length} source${issues.length === 1 ? '' : 's'} need a look` : `${stored.toLocaleString()} rows stored`} {open ? '▴' : '▾'}
          </button>
        )}
        {message && <span className="text-gray-300">{message}</span>}
      </div>
      {open && status && (
        <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
          {status.sources.map((m) => (
            <li key={m.id} className={m.error || m.held ? 'text-yellow-300' : ''}>
              {m.label}: {m.count.toLocaleString()} rows, synced {ago(m.syncedAt)}
              {m.error && ` - last update failed (${m.error})`}
              {m.held && ` - ${m.held.missing} stored rows were not in the latest answer (kept)`}
            </li>
          ))}
          {status.missing.map((id) => (
            <li key={id} className="text-yellow-300">
              {id}: not stored yet
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
