import { WALLET_KEYS, WALLET_LABELS, WALLET_LINKS, type WalletKey } from '../wallets';
import { BTC_ADDRESS, HIVE_ACCOUNTS } from './accounts';

/**
 * Every place the Taxes page reads history from. The four EVM groups come from the other apps
 * (lib/sources.ts); native Bitcoin and the Hive accounts are read by this app itself (keyless APIs),
 * one source key per Hive account ("hive:mes") so each row says which account it was.
 */
export type TaxGroup = WalletKey | 'bitcoin' | 'hive';

export const TAX_GROUPS: TaxGroup[] = [...WALLET_KEYS, 'bitcoin', 'hive'];

export const TAX_GROUP_LABELS: Record<TaxGroup, string> = {
  ...WALLET_LABELS,
  bitcoin: 'Bitcoin',
  hive: 'Hive',
};

export function groupOf(source: string): TaxGroup {
  if (source.startsWith('hive:')) return 'hive';
  return source as TaxGroup;
}

export function sourceLabel(source: string): string {
  if (source.startsWith('hive:')) return `Hive @${source.slice(5)}`;
  return TAX_GROUP_LABELS[source as TaxGroup] ?? source;
}

export function sourceLink(source: string): string {
  if (source.startsWith('hive:')) return `https://peakd.com/@${source.slice(5)}/wallet`;
  if (source === 'bitcoin') return `https://mempool.space/address/${BTC_ADDRESS}`;
  return WALLET_LINKS[source as WalletKey] ?? 'https://mes.fm/assets';
}

export const HIVE_SOURCE_KEYS = HIVE_ACCOUNTS.map((a) => `hive:${a}`);
