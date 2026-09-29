import { isBitcoinSymbol } from '@/lib/btc';
import { amount, usd } from '@/lib/format';
import { SOURCE_LABELS } from '@/lib/constants';
import type { GroupSummary, Holding } from '@/lib/types';

/**
 * Combined Bitcoin exposure across every wrapped/native variant this wallet holds (BTCB, WBTC,
 * SWAP.BTC, native BTC, ... - see lib/btc.ts), rolled into one BTC-denominated total. The holdings
 * table below still shows each one under its own real symbol and chain - this is purely an added
 * summary card, not a replacement, so which wallet holds what is never hidden. LP positions are
 * excluded: their `amount` isn't a raw BTC quantity, so rolling one in would misstate the total.
 */
export default function BitcoinSummary({ holdings, groups }: { holdings: Holding[]; groups: GroupSummary[] }) {
  const groupLabel = Object.fromEntries(groups.map((g) => [g.key, g.label]));
  const rows = holdings.filter((h) => isBitcoinSymbol(h.symbol) && h.kind !== 'lp');
  if (rows.length === 0) return null;

  const totalBtc = rows.reduce((s, h) => s + h.amount, 0);
  const totalUsd = rows.reduce((s, h) => s + (h.valueUsd ?? 0), 0);

  return (
    <div className="panel">
      <p className="stat-label">Bitcoin (combined)</p>
      <p className="mt-1 text-2xl font-semibold">
        {amount(totalBtc)} BTC <span className="text-base font-normal text-gray-400">({usd(totalUsd)})</span>
      </p>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-gray-400">
        {rows
          .slice()
          .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
          .map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2">
              <span>
                {h.symbol} <span className="text-gray-500">· {groupLabel[h.group] ?? h.group} · {SOURCE_LABELS[h.source]}</span>
              </span>
              <span className="shrink-0 text-gray-300">
                {amount(h.amount)} ({usd(h.valueUsd)})
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
