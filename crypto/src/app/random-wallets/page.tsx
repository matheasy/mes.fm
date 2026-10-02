'use client';

import { RANDOM_WALLETS, type RandomWallet } from '@/lib/randomWallets';

const qty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });
const val = (n: number | null, currency: string) =>
  n === null ? '—' : `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

function WalletCard({ w }: { w: RandomWallet }) {
  const worth = w.holdings.filter((h) => (h.value ?? 0) > 0);
  const dust = w.holdings.filter((h) => !((h.value ?? 0) > 0));
  return (
    <div className="panel flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-gray-100">
            {w.link ? (
              <a href={w.link} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                {w.name}
              </a>
            ) : (
              w.name
            )}
          </p>
          <p className="text-xs text-gray-500">
            {w.kind} · {w.status} · as of {w.asOf}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold">{val(w.total, w.currency)}</p>
          {w.totalBtc !== undefined && <p className="text-xs text-gray-500">≈ {qty(w.totalBtc)} BTC</p>}
        </div>
      </div>

      {w.holdings.length > 0 && (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Coin</th>
                <th>Amount</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {[...worth, ...dust].map((h) => (
                <tr key={h.symbol} className={(h.value ?? 0) > 0 ? '' : 'text-gray-500'}>
                  <td>
                    <span className="font-medium">{h.symbol}</span>
                    {h.name && <span className="block text-xs text-gray-500">{h.name}</span>}
                  </td>
                  <td className="tabular-nums">{qty(h.amount)}</td>
                  <td className="tabular-nums">{val(h.value, w.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {w.notes && <p className="text-xs text-gray-500">{w.notes}</p>}
    </div>
  );
}

/**
 * mes.fm/random-wallets - a reference list of old wallets / exchange accounts (lib/randomWallets.ts,
 * hand-maintained). Deliberately separate: nothing here is fetched or counted anywhere else.
 */
export default function RandomWalletsPage() {
  const wallets = [...RANDOM_WALLETS].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  // altogether, per quote currency (USDT, USD...) - snapshots of different dates, so only a rough figure
  const totals = new Map<string, number>();
  for (const w of wallets) if (w.total !== null) totals.set(w.currency, (totals.get(w.currency) ?? 0) + w.total);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-gray-400">
        Old wallets and exchange accounts you don&apos;t use or can&apos;t get into any more, kept here for reference. The numbers are
        snapshots from screenshots or statements, entered by hand -{' '}
        <strong className="text-gray-200">none of it is counted</strong> in Assets, Transactions, the Portfolio total or Taxes.
      </p>
      {totals.size > 0 && (
        <div className="panel">
          <p className="stat-label">Altogether (reference only)</p>
          <p className="mt-1 text-3xl font-semibold">{[...totals].map(([c, t]) => val(t, c)).join(' + ')}</p>
          <p className="mt-1 text-xs text-gray-500">
            {wallets.length} account{wallets.length === 1 ? '' : 's'}, at each one&apos;s own snapshot date
          </p>
        </div>
      )}
      {wallets.length === 0 ? (
        <div className="panel py-10 text-center text-gray-400">Nothing listed yet.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {wallets.map((w) => (
            <WalletCard key={w.name} w={w} />
          ))}
        </div>
      )}
    </div>
  );
}
