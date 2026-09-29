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
/**
 * AI Trading and MikeFA are sections of this same app now (src/app/ai, src/app/mfa - separate
 * apps/Vercel projects until 2026-09-29). They're still called over HTTP rather than in-process, so
 * a long first read of a wallet's history (e.g. the Main wallet's BNB Chain windows) gets its own
 * serverless request and 60s rather than eating into the Taxes request's. No env override on
 * purpose: the old AI_SOURCE_URL / MFA_SOURCE_URL values pointed at the retired projects.
 */
const SELF = 'https://mes-fm-crypto.vercel.app/finance';

export const WALLET_SOURCES: WalletSource[] = [
  {
    // The Main wallet is served by the AI Trading section too (src/apps/ai/lib/walletContext.ts,
    // ?wallet=main); its BTCB/WBTC are left out of its holdings (Store of Value shows them).
    key: 'main',
    label: WALLET_LABELS.main,
    apiBaseUrl: `${SELF}/ai`,
    linkPath: WALLET_LINKS.main,
    query: 'wallet=main',
  },
  {
    key: 'ai',
    label: WALLET_LABELS.ai,
    apiBaseUrl: `${SELF}/ai`,
    linkPath: WALLET_LINKS.ai,
  },
  {
    key: 'mfa',
    label: WALLET_LABELS.mfa,
    apiBaseUrl: `${SELF}/mfa`,
    linkPath: WALLET_LINKS.mfa,
  },
];
