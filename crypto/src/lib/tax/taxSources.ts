import { WALLET_LABELS, WALLET_LINKS, type WalletKey } from '../wallets';
import { BTC_ADDRESS, HIVE_ACCOUNTS, XRP_ADDRESS } from './accounts';

/**
 * Every place the Taxes page reads history from. The four EVM groups come from the other apps
 * (lib/sources.ts); native Bitcoin and the Hive accounts are read by this app itself (keyless APIs),
 * one source key per Hive account ("hive:mes") so each row says which account it was.
 */
export type TaxGroup = Exclude<WalletKey, 'sov'> | 'bitcoin' | 'xrp' | 'hive';

/** The Store of Value group isn't a source here: its BTC is the Main wallet's, its XRP and TGLD are read directly */
export const TAX_GROUPS: TaxGroup[] = ['main', 'ai', 'mfa', 'bitcoin', 'xrp', 'hive'];

export const TAX_GROUP_LABELS: Record<TaxGroup, string> = {
  main: WALLET_LABELS.main,
  ai: WALLET_LABELS.ai,
  mfa: WALLET_LABELS.mfa,
  bitcoin: 'Bitcoin',
  xrp: 'XRP',
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
  if (source === 'xrp') return `https://xrpscan.com/account/${XRP_ADDRESS}`;
  return WALLET_LINKS[source as WalletKey] ?? 'https://mes.fm/assets';
}

export const HIVE_SOURCE_KEYS = HIVE_ACCOUNTS.map((a) => `hive:${a}`);
