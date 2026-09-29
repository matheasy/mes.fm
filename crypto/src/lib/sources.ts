import { WALLET_LABELS, WALLET_LINKS } from './wallets';
import type { WalletKey } from './wallets';

export interface WalletSource {
  key: WalletKey;
  label: string;
  /** This wallet's own production API - where the combined view fetches already-computed data from */
  apiBaseUrl: string;
  /** Where a person clicks through to see that wallet's full dashboard */
  linkPath: string;
  /** Extra query string every request to this source carries (e.g. `wallet=main`) */
  query?: string;
}

/** `${apiBaseUrl}${path}` plus the source's own query string, if it has one */
export function sourceUrl(source: WalletSource, path: string): string {
  const url = `${source.apiBaseUrl}${path}`;
  if (!source.query) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${source.query}`;
}

/**
 * This app has no Moralis/CoinGecko keys or wallet address of its own - it aggregates the
 * ai/ (AI Trading + Main wallet) and mfa/ trackers' own production APIs (mes.fm/sov is a page of
 * this app now, built from mes.fm/assets - see src/app/sov), which already fetch, cache, and account for their
 * respective wallets. Defaults match the destinations in ../mes.fm/vercel.json's rewrites.
 */
export const WALLET_SOURCES: WalletSource[] = [
  {
    // The Main wallet is served by the ai/ app too (ai/src/lib/walletContext.ts), with its
    // BTCB/WBTC left out there because sov already counts them - no Vercel project of its own.
    key: 'main',
    label: WALLET_LABELS.main,
    apiBaseUrl: process.env.AI_SOURCE_URL ?? 'https://mes-fm-ai.vercel.app/ai',
    linkPath: WALLET_LINKS.main,
    query: 'wallet=main',
  },
  {
    key: 'ai',
    label: WALLET_LABELS.ai,
    apiBaseUrl: process.env.AI_SOURCE_URL ?? 'https://mes-fm-ai.vercel.app/ai',
    linkPath: WALLET_LINKS.ai,
  },
  {
    key: 'mfa',
    label: WALLET_LABELS.mfa,
    apiBaseUrl: process.env.MFA_SOURCE_URL ?? 'https://mes-fm-mfa.vercel.app/mfa',
    linkPath: WALLET_LINKS.mfa,
  },
];
