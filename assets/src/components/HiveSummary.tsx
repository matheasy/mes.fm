import { amount, usd } from '@/lib/format';
import { SOURCE_LABELS } from '@/lib/constants';
import { hiveAssetGroup } from '@/lib/hive';
import type { GroupSummary, Holding } from '@/lib/types';

/**
 * Combined HIVE and HBD across every separate Hive account (mes, mestruth, mathiew, artgrafiken -
 * each its own GROUPS entry in lib/config.ts) AND across L1 vs. Hive Engine's wrapped
 * SWAP.HIVE/SWAP.HBD (see lib/hive.ts) - the same idea as BitcoinSummary, just combining across
 * two axes (account and wrapper) instead of one. Liquid, staked (Hive Power / Magi consensus),
 * savings, and unclaimed rewards are all still real HIVE/HBD, just spread across four identities
 * and two representations. Two separate totals (HIVE, HBD) rather than one blended figure - unlike
 * BTCB/WBTC/etc, HIVE and HBD are not 1:1 pegged to each other (HBD is a ~$1 stablecoin, HIVE
 * floats), so summing their raw amounts together would be meaningless. LP positions are excluded
 * for the same reason as BitcoinSummary - their `amount` isn't a raw token quantity.
 */
function block(symbol: 'HIVE' | 'HBD', rows: Holding[], groupLabel: Record<string, string>) {
  if (rows.length === 0) return null;
  const totalAmount = rows.reduce((s, h) => s + h.amount, 0);
  const totalUsd = rows.reduce((s, h) => s + (h.valueUsd ?? 0), 0);

  return (
    <div className="flex-1">
      <p className="stat-label">{symbol} (combined)</p>
      <p className="mt-1 text-2xl font-semibold">
        {amount(totalAmount)} {symbol} <span className="text-base font-normal text-gray-400">({usd(totalUsd)})</span>
      </p>
      <ul className="mt-3 flex flex-col gap-1 text-sm text-gray-400">
        {rows
          .slice()
          .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
          .map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-2">
              <span>
                {h.label ?? h.symbol} <span className="text-gray-500">· {groupLabel[h.group] ?? h.group} · {SOURCE_LABELS[h.source]}</span>
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

export default function HiveSummary({ holdings, groups }: { holdings: Holding[]; groups: GroupSummary[] }) {
  const groupLabel = Object.fromEntries(groups.map((g) => [g.key, g.label]));
  const eligible = holdings.filter((h) => h.kind !== 'lp');
  const hive = eligible.filter((h) => hiveAssetGroup(h.symbol) === 'HIVE');
  const hbd = eligible.filter((h) => hiveAssetGroup(h.symbol) === 'HBD');
  if (hive.length === 0 && hbd.length === 0) return null;

  return (
    <div className="panel flex flex-col gap-6 sm:flex-row sm:gap-8">
      {block('HIVE', hive, groupLabel)}
      {block('HBD', hbd, groupLabel)}
    </div>
  );
}
