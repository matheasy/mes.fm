import { WALLET_LABELS, WALLET_LINKS } from './wallets';
import type { WalletKey } from './wallets';

export interface WalletSource {
  key: WalletKey;
  label: string;
  /** This wallet's own production API - where the combined view fetches already-computed data from */
  apiBaseUrl: string;
  /** Where a person clicks through to see that wallet's full dashboard */
  linkPath: string;
}

/**
 * This app has no Moralis/CoinGecko keys or wallet address of its own - it aggregates the
 * ai/ and mfa/ trackers' own production APIs, which already fetch, cache, and account for their
 * respective wallets. Defaults match the destinations in ../mes.fm/vercel.json's rewrites.
 */
export const WALLET_SOURCES: WalletSource[] = [
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
  {
    key: 'sov',
    label: WALLET_LABELS.sov,
    apiBaseUrl: process.env.SOV_SOURCE_URL ?? 'https://mes-fm-sov.vercel.app/sov',
    linkPath: WALLET_LINKS.sov,
  },
];
