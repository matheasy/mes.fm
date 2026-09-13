# MikeFA Trading

Read-only portfolio, transaction history, and capital-gains dashboard for a single BNB Smart
Chain (BSC) wallet. Deployed to production at **mes.fm/mfa**.

This is a **read-only** tracker. It never asks for or handles a private key or seed phrase.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts, deployed to Vercel as its own
project. It's a separate Vercel project from the rest of `mes.fm` (which is plain static HTML) -
see "Deploying at mes.fm/mfa" below for how the two are stitched together.

## Setup

```bash
cd mfa
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `WALLET_ADDRESS` - defaults to the wallet already hardcoded as a fallback in
  [`src/lib/config.ts`](src/lib/config.ts); set this to track a different wallet without touching
  code.
- `NODEREAL_API_KEY` - free key from [dashboard.nodereal.io](https://dashboard.nodereal.io) (BSC
  MegaNode/BSCTrace). Used for native + BEP-20 balances and transaction history via plain JSON-RPC
  (`eth_getBalance` + `nr_getAssetTransfers`). **Note:** this app originally targeted BscScan/
  Etherscan's API, then Moralis once Etherscan moved BNB Chain access behind a paid plan - but
  Moralis's own free BSC tier has since ended too, so it now uses NodeReal's BSCTrace (BNB Chain's
  own endorsed free replacement), the same provider the mes.fm/ai and mes.fm/sov trackers use.
- `COINGECKO_API_KEY` - optional. Works without one at low volume; a free
  ["Demo"](https://www.coingecko.com/en/api/pricing) key raises the rate limit. Used for the
  native coin's and every BEP-20 token's current + historical USD pricing (needed by the
  cost-basis engine) - NodeReal doesn't attach live pricing to balances/transfers the way Moralis
  did, so every holding now needs its own CoinGecko lookup.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` - an Upstash Redis instance (the Vercel KV integration
  sets these same variable names automatically when attached to the project). This backs the
  server-side cache. **Local dev works without it** - caching is just skipped and every request
  hits NodeReal/CoinGecko directly, so expect to hit rate limits faster locally.

```bash
npm run dev
```

Open `http://localhost:3000/mfa` (the app is mounted at the `/mfa` base path even locally, to
match production).

## Architecture

- `src/lib/nodeReal.ts`, `src/lib/coingecko.ts` - thin API clients, called only from server code
  (`src/app/api/**/route.ts`) so API keys never reach the browser.
- `src/lib/cache.ts` - Upstash Redis get/set-with-TTL wrapper, a cross-instance rate-limit slot
  (`acquireGlobalSlot`, used by `src/lib/rateLimit.ts`'s throttle around NodeReal calls), and
  wallet-scoped cache invalidation used by the refresh button.
- `src/lib/ledger.ts` - groups `nr_getAssetTransfers`' flat list of native + BEP-20 transfer legs
  by tx hash (NodeReal, unlike Moralis, doesn't pre-group or categorize transfers per tx), then
  classifies each group into the app's `Holding[]` / `Transaction[]` / accounting `Lot[]` &
  `Disposal[]` shapes: a single leg is a send/receive, a hash with both a debit and a credit leg
  is a swap. Current BEP-20 holdings are derived by summing the fetched transfer history, since
  NodeReal's free tier has no bulk "current balances" endpoint.
- `src/lib/accounting/` - the cost-basis engine. `CostBasisStrategy` is a small interface
  (`fifo.ts`, `lifo.ts`, `average.ts` each implement it); `engine.ts` replays a token's lot
  history against its disposals through whichever strategy is selected (`?method=` query param,
  default `fifo`) to produce realized/unrealized gains, short vs. long-term (365-day threshold),
  and tax-year grouping.
- `src/lib/csv.ts` - builds the tax-reporting CSV from realized `GainResult[]`.

### Known simplifications

- Gas is not shown or tracked (always 0) - `nr_getAssetTransfers` doesn't return gas, and fetching
  a receipt per unique tx hash would multiply request volume against an unconfirmed free tier.
  This is a regression versus the old Moralis-based gas display, not silently dropped.
- The "average cost" method pools cost basis correctly, but the acquisition date used for its
  short/long-term split is a quantity-weighted average across the pool, since average cost isn't
  a method the IRS formally recognizes for crypto - treat it as a rough approximation, and prefer
  FIFO or LIFO if you need a defensible cost-basis method for filing.
- Unlike Moralis, NodeReal doesn't flag spam tokens - unsolicited airdrops now show up in
  holdings/transaction history like any other BEP-20 token (they'll typically show no CoinGecko
  price and $0 value).
- Tax year / long-term threshold logic assumes US rules (calendar tax year, 1-year long-term
  threshold). Adjust `LONG_TERM_THRESHOLD_DAYS` in `src/lib/config.ts` if that doesn't apply to
  you.

## Deploying at mes.fm/mfa

`mes.fm` itself is a plain static site with no build step (see the repo root `CLAUDE.md`), so this
app is **not** part of that deployment - it's its own Vercel project, wired into `mes.fm/mfa` via
a Vercel rewrite (Vercel/Next.js's "multi-zones" pattern). The two pieces:

1. **Deploy this project to Vercel** (`vercel` or via the Vercel dashboard, rooted at this `mfa/`
   directory), and set the env vars from `.env.example` in the Vercel project settings. Note the
   deployment's URL (e.g. `https://mfa-mes-fm.vercel.app`).
2. **Add a rewrite in the main site**: in `../mes.fm/vercel.json` (the vercel.json for the root
   `mes.fm` domain), add a `rewrites` array alongside the existing `redirects`:

   ```json
   "rewrites": [
     { "source": "/mfa", "destination": "https://mfa-mes-fm.vercel.app/mfa" },
     { "source": "/mfa/:path*", "destination": "https://mfa-mes-fm.vercel.app/mfa/:path*" }
   ]
   ```

   Replace the destination host with your actual deployment URL from step 1. Redeploy the main
   `mes.fm` site for the rewrite to take effect.

This app's `next.config.js` sets `basePath: '/mfa'` so its own routes, assets, and API calls all
resolve correctly whether it's hit directly at its Vercel URL or proxied in under `mes.fm/mfa`.

## Manual refresh & caching

Data is cached server-side in Redis (portfolio/transactions for a few minutes, historical prices
indefinitely since they never change) to stay within NodeReal/CoinGecko's free-tier rate limits.
There's no polling - each page loads from cache, and the **Refresh** button on every page clears
this wallet's cached entries and re-fetches.
