import { AsyncLocalStorage } from 'node:async_hooks';
import { WALLETS, type WalletConfig, type WalletKey } from './config';

/**
 * Which wallet the current request is about. This app was built for one wallet (the AI Trading
 * wallet, from WALLET_ADDRESS); since 2026-09-29 it also serves the Main wallet for mes.fm/taxes
 * and mes.fm/portfolio (`?wallet=main` on any API route), using the same NodeReal / Etherscan /
 * CoinGecko keys instead of a second Vercel project. AsyncLocalStorage carries the choice down to
 * the network modules without threading a parameter through every function; every cache key
 * already includes the address (cacheKey('rawwallet', address, network)), so the two never mix.
 *
 * Server-side only (node:async_hooks): keep it out of anything a client component imports -
 * config.ts is imported by client components, which is why this lives in its own file.
 */
const store = new AsyncLocalStorage<WalletConfig>();

export function currentWallet(): WalletConfig {
  return store.getStore() ?? WALLETS.ai;
}

export function walletFromRequest(request: Request): WalletConfig {
  const key = new URL(request.url).searchParams.get('wallet');
  return key && key in WALLETS ? WALLETS[key as WalletKey] : WALLETS.ai;
}

/** Runs `fn` as one wallet, from code that isn't handling a `?wallet=` request (e.g. mes.fm/lp's own route) */
export function runAsWallet<T>(key: WalletKey, fn: () => Promise<T>): Promise<T> {
  return store.run(WALLETS[key], fn);
}

/** Runs a route handler with `?wallet=` (default: the AI Trading wallet) as the current wallet */
export function withWallet<T>(request: Request, fn: () => Promise<T>): Promise<T> {
  return store.run(walletFromRequest(request), fn);
}
