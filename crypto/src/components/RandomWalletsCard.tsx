import { RANDOM_WALLETS } from '@/lib/randomWallets';

/** The overview's Random Wallets card: old wallets / exchange accounts, for reference - never in any total */
export default function RandomWalletsCard() {
  const totals = new Map<string, number>();
  for (const w of RANDOM_WALLETS) if (w.total !== null) totals.set(w.currency, (totals.get(w.currency) ?? 0) + w.total);
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <a href="https://mes.fm/random-wallets" className="panel block transition hover:border-accent">
      <div className="flex items-center justify-between">
        <p className="stat-label">Random wallets · reference only</p>
        <span className="text-xs text-accent">View &rarr;</span>
      </div>
      <p className="mt-1 text-2xl font-semibold">{[...totals].map(([c, t]) => `${fmt(t)} ${c}`).join(' + ') || '—'}</p>
      <p className="mt-1 text-sm text-gray-400">{RANDOM_WALLETS.map((w) => w.name).join(' · ')}</p>
      <p className="mt-2 text-xs text-gray-500">Old accounts you don&apos;t use any more - not counted in the total above.</p>
    </a>
  );
}
