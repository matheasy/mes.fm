'use client';

function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 48 * 3600) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** "Prices from 3 days ago · updating…" under a number that is the saved copy, not yet the live one */
export default function FreshNote({ savedAt, updating, error }: { savedAt: string | null; updating: boolean; error?: string | null }) {
  if (!savedAt) return null;
  return (
    <p className="text-xs text-yellow-300/90">
      Prices from {ago(savedAt)}
      {updating ? ' · updating…' : error ? ` · couldn't update (${error})` : ''}
    </p>
  );
}
