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
- `BSCSCAN_API_KEY` - free key from [bscscan.com/apis](https://bscscan.com/apis). BscScan's
  standalone key program now runs on Etherscan's multichain V2 API; a BscScan-issued key works,
  this app just calls `api.etherscan.io/v2` with `chainid=56` under the hood.
- `COINGECKO_API_KEY` - optional. Works without one at low volume; a free
  ["Demo"](https://www.coingecko.com/en/api/pricing) key raises the rate limit.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` - an Upstash Redis instance (the Vercel KV integration
  sets these same variable names automatically when attached to the project). This backs the
  server-side cache. **Local dev works without it** - caching is just skipped and every request
  hits BscScan/CoinGecko directly, so expect to hit rate limits faster locally.

```bash
npm run dev
```

Open `http://localhost:3000/mfa` (the app is mounted at the `/mfa` base path even locally, to
match production).

## Architecture

- `src/lib/bscscan.ts`, `src/lib/coingecko.ts` - thin API clients, called only from server code
  (`src/app/api/**/route.ts`) so API keys never reach the browser.
- `src/lib/cache.ts` - Upstash Redis get/set-with-TTL wrapper, plus wallet-scoped cache
  invalidation used by the refresh button.
- `src/lib/ledger.ts` - normalizes raw BscScan data (native balance, BEP-20 transfers, normal
  txs) into the app's `Holding[]` / `Transaction[]` / accounting `Lot[]` & `Disposal[]` shapes.
- `src/lib/accounting/` - the cost-basis engine. `CostBasisStrategy` is a small interface
  (`fifo.ts`, `lifo.ts`, `average.ts` each implement it); `engine.ts` replays a token's lot
  history against its disposals through whichever strategy is selected (`?method=` query param,
  default `fifo`) to produce realized/unrealized gains, short vs. long-term (365-day threshold),
  and tax-year grouping.
- `src/lib/csv.ts` - builds the tax-reporting CSV from realized `GainResult[]`.

### Known simplifications

- Gas paid in BNB is shown in the transaction list (BNB and USD) but is **not** itself treated as
  a taxable disposal of BNB for gains purposes - only outbound sends/swaps of a token count.
- The "average cost" method pools cost basis correctly, but the acquisition date used for its
  short/long-term split is a quantity-weighted average across the pool, since average cost isn't
  a method the IRS formally recognizes for crypto - treat it as a rough approximation, and prefer
  FIFO or LIFO if you need a defensible cost-basis method for filing.
- Internal transactions (contract-to-EOA value transfers that don't appear in the normal tx list)
  aren't pulled in; only normal transactions and BEP-20 transfers are.
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
indefinitely since they never change) to stay within BscScan/CoinGecko's free-tier rate limits.
There's no polling - each page loads from cache, and the **Refresh** button on every page clears
this wallet's cached entries and re-fetches.
