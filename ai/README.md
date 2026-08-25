# MES AI Trading

Read-only portfolio, transaction history, and capital-gains dashboard for one wallet address
across **four networks**: BNB Smart Chain (BSC), Ethereum Mainnet, Arbitrum One, and Hyperliquid
(HyperCore spot + perps, and HyperEVM). Deployed to production at **mes.fm/ai**.

This is a **read-only** tracker. It never asks for or handles a private key or seed phrase.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts, deployed to Vercel as its own
project. It's a separate Vercel project from the rest of `mes.fm` (which is plain static HTML) -
see "Deploying at mes.fm/ai" below for how the two are stitched together.

This is a sibling of the `mfa/` tracker at the repo root (same architecture, different wallet and
mount path, single-network) - anything below that isn't wallet/path-specific applies there too.

## Setup

```bash
cd ai
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `WALLET_ADDRESS` - defaults to the wallet already hardcoded as a fallback in
  [`src/lib/config.ts`](src/lib/config.ts); set this to track a different wallet without touching
  code. The same address is queried on every network.
- `NODEREAL_API_KEY` - free key from [dashboard.nodereal.io](https://dashboard.nodereal.io) (BSC
  MegaNode/BSCTrace). Used for BSC only: native + BEP-20 balances and transaction history, via
  plain JSON-RPC (`eth_getBalance` + `nr_getAssetTransfers`). This app previously used Moralis for
  BSC, but Moralis's free tier ended 2026-09-01, and Etherscan's unified V2 API (used for
  Ethereum/Arbitrum below) doesn't offer a free tier for BNB Chain - NodeReal's BSCTrace is BNB
  Chain's own endorsed free replacement for the deprecated BscScan API. **Caveat:** NodeReal
  doesn't publish a full example of `nr_getAssetTransfers`'s response shape or documented free-tier
  rate limits; `src/lib/networks/nodeRealApi.ts` fails loudly (isolated to the BSC tab, not the
  whole app) if the response doesn't match the shape it assumes, rather than risk silently-wrong
  balances/gains - re-verify against your own account's real responses if anything looks off.
- `ETHERSCAN_API_KEY` - free key from [etherscan.io/apis](https://etherscan.io/apis). Covers
  **both Ethereum and Arbitrum** via Etherscan's unified V2 API (`chainid` param selects the
  chain) - there's no separate Arbiscan key/domain anymore. The free tier has no bulk
  "all balances" endpoint, so Ethereum/Arbitrum holdings are derived by summing paginated
  transfer history instead of a single live-balance call (see Known Limitations below), and the
  request budget is shared across both chains, not per-chain.
- Hyperliquid needs **no API key** - `src/lib/networks/hyperliquid.ts` calls Hyperliquid's public,
  keyless `https://api.hyperliquid.xyz/info` REST API for HyperCore (spot balances, perp
  positions, fill history), and a public HyperEVM JSON-RPC endpoint for the native HYPE balance.
- `COINGECKO_API_KEY` - optional. Works without one at low volume; a free
  ["Demo"](https://www.coingecko.com/en/api/pricing) key raises the rate limit (100 calls/min,
  10k/month). Used for current + historical USD pricing on BSC/Ethereum/Arbitrum - none of their
  balance/history APIs attach live pricing themselves. Hyperliquid spot pricing comes from
  Hyperliquid's own API instead (CoinGecko can't resolve HyperCore assets by contract address).
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` - an Upstash Redis instance (the Vercel KV integration
  sets these same variable names automatically when attached to the project). This backs the
  server-side cache. **Local dev works without it** - caching is just skipped and every request
  hits the upstream APIs directly, so expect to hit rate limits faster locally, especially on
  Hyperliquid (see Known Limitations).

```bash
npm run dev
```

Open `http://localhost:3000/ai` (the app is mounted at the `/ai` base path even locally, to match
production).

## Architecture

- `src/lib/networks/` - one client module per network family:
  - `bsc.ts` wraps `nodeRealApi.ts` (BSCTrace via NodeReal MegaNode: native balance +
    `nr_getAssetTransfers` transaction history). Like the Etherscan-family networks below, there's
    no bulk balance endpoint, so current BEP-20 holdings are derived by summing transfer history.
  - `etherscanNetwork.ts` (`createEtherscanNetwork('ethereum' | 'arbitrum')`, thinly re-exported
    by `ethereum.ts`/`arbitrum.ts`) wraps `etherscanApi.ts`, Etherscan's unified V2 client. Its
    free tier also has no bulk balance endpoint, so this merges `txlist` (native) + `tokentx`
    (ERC-20) transfer history by tx hash and derives current balances by summation.
  - `hyperliquid.ts` wraps `hyperliquidApi.ts` (Hyperliquid's public `/info` REST API) for
    HyperCore spot balances/fills and perp positions/fills, plus `hyperevm.ts` (a plain JSON-RPC
    `eth_getBalance` call) for the HyperEVM native HYPE balance.
  - `evmLedger.ts` holds logic shared by every EVM-style network (BSC/Ethereum/Arbitrum):
    attaching historical USD prices to a transaction feed, then turning it into cost-basis
    `Lot[]`/`Disposal[]`.
  - Every module exposes a `getNetworkLedgerData(): Promise<NetworkLedgerData>` (holdings,
    transactions, lots, disposals, priced transactions) with the same shape, so `src/lib/ledger.ts`
    can call all four uniformly.
- `src/lib/ledger.ts` - the orchestration layer: fetches every requested network's ledger data via
  `Promise.allSettled` (so one network being down/rate-limited never blanks the other three - see
  `AggregatedNetworkData`/`networkErrors`), concatenates holdings/transactions for "All Networks",
  and keeps each network's `Lot[]`/`Disposal[]` separate (never pooled across networks) for the
  accounting engine.
- `src/lib/accounting/` - the cost-basis engine, unchanged by the multi-network work except that
  `Lot`/`Disposal`/`GainResult`/`UnrealizedGain` now carry a `network` field and lots match on
  `(network, contractAddress)` rather than symbol alone (hardens against two different tokens
  sharing a symbol ever pooling into one FIFO queue). `engine.ts`'s `runLedger()` is called once
  per network by the `/api/gains` route, and the resulting `GainResult[]`/`UnrealizedGain[]` are
  concatenated for the combined view - `fifo.ts`/`lifo.ts`/`average.ts` are untouched.
- Hyperliquid perpetuals P&L (`HyperliquidPerpSummary` in `src/lib/networks/types.ts`) is
  structurally separate from the FIFO engine entirely - it's mark-to-market data reported directly
  by Hyperliquid's API (`clearinghouseState`/fill `closedPnl`), not lot-based. Rendered in its own
  labeled, informational-only section on the Gains page, never merged into the FIFO summary.
- `src/lib/coingecko.ts` - thin API client, called only from server code so API keys never reach
  the browser (same for every `src/lib/networks/*Api.ts` client).
- `src/lib/errors.ts` - a `RateLimitError` class thrown by every upstream client on a
  429/quota-exceeded response, `apiErrorResponse()` for the all-networks-failed case, and
  `describeNetworkError()` for the partial-failure case surfaced via `ApiResult.networkErrors`.
- `src/lib/cache.ts` - Upstash Redis get/set-with-TTL wrapper. Network-scoped cache keys always
  put the network segment **last** (`cacheKey('rawwallet', WALLET_ADDRESS, network)`) - see the
  comment in that file for why order matters for wallet-scoped cache invalidation.
- `src/lib/csv.ts` - builds the tax-reporting CSV from realized `GainResult[]`, including a
  Network column.
- `src/components/NetworkTabs.tsx` - the "All Networks / BSC / Ethereum / Arbitrum / Hyperliquid"
  selector used on every page; drives a `?network=` query param on the underlying API calls.
- `src/components/NetworkErrorBanner.tsx` - renders per-network failures (from `networkErrors`)
  without blocking the rest of the page from showing whatever networks did succeed.
- `src/components/SwrProvider.tsx` - a single app-wide SWR cache (wrapping the root layout, which
  stays mounted across client-side navigation) so data fetches once per page per browser session
  and only refetches when the **Refresh Data** button is clicked - not on tab focus, reconnect, or
  navigating between pages. It also disables SWR's automatic error-retry loop, so a failed fetch
  stays failed (with a visible Retry) instead of silently hammering the API in the background.
- `src/hooks/*` - one SWR hook per API route, each exposing `rateLimited` (fully failed) and
  `networkErrors` (partial per-network failures) flags.

### Known simplifications and limitations

- Gas paid in a network's native coin is shown in the transaction list (native + USD) but is
  **not** itself treated as a taxable disposal of that coin for gains purposes - only outbound
  sends/swaps of a token count.
- The "average cost" method pools cost basis correctly, but the acquisition date used for its
  short/long-term split is a quantity-weighted average across the pool, since average cost isn't
  a method the IRS formally recognizes for crypto - treat it as a rough approximation, and prefer
  FIFO or LIFO if you need a defensible cost-basis method for filing.
- **Ethereum/Arbitrum balances are derived by summing paginated transfer history**, not read from
  a live bulk-balance call (Etherscan's free tier has no such endpoint) - `etherscanApi.ts` caps
  pagination at 5 pages of 1,000 records per endpoint; a wallet with more than ~5,000 transfer
  events on one of these networks will have an inaccurate current balance and incomplete history.
- **HyperEVM: native HYPE balance only, no ERC-20 token discovery** - there's no indexer/explorer
  API configured for HyperEVM, so any HyperEVM-native token holdings at this address (beyond HYPE
  itself) are invisible to this app.
- **Hyperliquid spot pricing** uses Hyperliquid's own fill price (for cost basis) and `allMids`
  (for current value), not CoinGecko - HyperCore spot assets aren't standard EVM contracts and
  won't resolve via CoinGecko's contract-address lookup. Only USDC-quoted spot pairs are priced;
  a pair quoted against something other than USDC is skipped (documented gap, not silently wrong).
- **Hyperliquid fill history lookback**: `hyperliquidApi.ts`'s `getFillsSince()` pages backward
  from now in 90-day windows, stopping after 2 consecutive empty windows (to avoid burning
  Hyperliquid's rate limit walking years of empty history for low-activity wallets) or after 12
  windows (~3 years), whichever comes first. A wallet that traded heavily long ago and has been
  fully quiet more recently could have that older history missed - not exhaustive.
- **Hyperliquid perpetuals P&L is informational only, not tax advice** - whether/how perpetuals on
  an offshore DeFi platform receive any particular tax treatment (e.g. IRC §1256) is not asserted.
- **No spam-token filtering on any network** - NodeReal's `nr_getAssetTransfers` and Etherscan's
  `tokentx` don't flag spam/unsolicited-airdrop tokens the way Moralis's BSC endpoint used to, so
  a wallet that's received spam airdrops may see them listed as holdings/transactions on any of
  BSC/Ethereum/Arbitrum. (Hyperliquid is unaffected - HyperCore only lists assets you've actually
  traded/held via its own venue.)
- **BSC transactions show no gas** - `nr_getAssetTransfers` doesn't return gas data, and fetching
  a receipt per transaction would add a request per tx against BSCTrace's unconfirmed free-tier
  rate limit, so `gasUsedNative` is always 0 for BSC rows (Ethereum/Arbitrum/gas-bearing display
  is unaffected - this is BSC-specific, a regression from the old Moralis-based display).
- Tax year / long-term threshold logic assumes US rules (calendar tax year, 1-year long-term
  threshold). Adjust `LONG_TERM_THRESHOLD_DAYS` in `src/lib/config.ts` if that doesn't apply to
  you.
- The stale-data-on-rate-limit fallback is client-side only (this browser session's SWR cache) -
  without Redis configured, a cold page load during an active rate-limit outage has nothing to
  fall back to and shows the normal error/per-network-error state instead.

## Deploying at mes.fm/ai

`mes.fm` itself is a plain static site with no build step (see the repo root `CLAUDE.md`), so this
app is **not** part of that deployment - it's its own Vercel project, wired into `mes.fm/ai` via
a Vercel rewrite (Vercel/Next.js's "multi-zones" pattern). The two pieces:

1. **Deploy this project to Vercel** (`vercel` or via the Vercel dashboard, rooted at this `ai/`
   directory), and set the env vars from `.env.example` in the Vercel project settings. Note the
   deployment's URL (e.g. `https://mes-fm-ai.vercel.app`).
2. **Add a rewrite in the main site**: in `../mes.fm/vercel.json` (the vercel.json for the root
   `mes.fm` domain), add entries to the existing `rewrites` array (alongside the `mfa` ones):

   ```json
   { "source": "/ai", "destination": "https://mes-fm-ai.vercel.app/ai" },
   { "source": "/ai/:path*", "destination": "https://mes-fm-ai.vercel.app/ai/:path*" }
   ```

   Replace the destination host with your actual deployment URL from step 1. Redeploy the main
   `mes.fm` site for the rewrite to take effect.

This app's `next.config.js` sets `basePath: '/ai'` so its own routes, assets, and API calls all
resolve correctly whether it's hit directly at its Vercel URL or proxied in under `mes.fm/ai`.

## Manual refresh & caching

Data is cached server-side in Redis (transactions for a few minutes, historical prices
indefinitely since they never change) to stay within every upstream API's free-tier rate limits.
There's no polling - each page fetches once per browser session, and the **Refresh Data** button
on every page clears this wallet's cached entries (across all four networks) and re-fetches (it's
greyed out instead of clickable while an upstream rate limit is active).
