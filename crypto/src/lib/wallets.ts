export type WalletKey = 'main' | 'ai' | 'mfa' | 'sov';

export const WALLET_KEYS: WalletKey[] = ['main', 'ai', 'mfa', 'sov'];

export const WALLET_LABELS: Record<WalletKey, string> = {
  main: 'Main Wallet',
  ai: 'AI Trading',
  mfa: 'MikeFA Trading',
  sov: 'Store of Value',
};

/**
 * Absolute URLs, not relative paths - these leave this app entirely (its own `basePath` is
 * '/crypto', and `ai`/`mfa` are separate Vercel deployments only proxied under mes.fm at the
 * domain level, not sub-routes of this app), so a relative `next/link` href would get this app's
 * own basePath prepended (`/crypto/ai`) instead of leaving it.
 */
export const WALLET_LINKS: Record<WalletKey, string> = {
  // no dashboard of its own: its balances are on mes.fm/assets, its history on Transactions / Taxes
  main: 'https://mes.fm/assets',
  ai: 'https://mes.fm/ai',
  mfa: 'https://mes.fm/mfa',
  sov: 'https://mes.fm/sov',
};
