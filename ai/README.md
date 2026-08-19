# MES AI Trading

Read-only portfolio, transaction history, and capital-gains dashboard for a single BNB Smart
Chain (BSC) wallet. Deployed to production at **mes.fm/ai**.

This is a **read-only** tracker. It never asks for or handles a private key or seed phrase.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts, deployed to Vercel as its own
project. It's a separate Vercel project from the rest of `mes.fm` (which is plain static HTML) -
see "Deploying at mes.fm/ai" below for how the two are stitched together.

This is a sibling of the `mfa/` tracker at the repo root (same architecture, different wallet and
mount path) - anything below that isn't wallet/path-specific applies there too.

## Setup

```bash
cd ai
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

- `WALLET_ADDRESS` - defaults to the wallet already hardcoded as a fallback in
  [`src/lib/config.ts`](src/lib/config.ts); set this to track a different wallet without touching
  code.
- `MORALIS_API_KEY` - free key from [moralis.com](https://moralis.com) (Web3 Data API, free tier
  is 40k compute units/**day**). Used for native + BEP-20 balances and decoded transaction
  history. **Note:** compute units pool per Moralis account, not per key or per app - reusing the
  same key as the `mfa/` tracker shares one 40k/day budget across both wallets; sign up with a
  different email if that becomes a bottleneck. (This app originally targeted BscScan/Etherscan's
  API, but as of 2026 Etherscan moved BNB Chain access behind a paid plan - Moralis has a
  genuinely free BSC tier, so that's what's wired up.)
- `COINGECKO_API_KEY` - optional. Works without one at low volume; a free
  ["Demo"](https://www.coingecko.com/en/api/pricing) key raises the rate limit (100 calls/min,
  10k/month). Only used for the native coin's current price and for historical prices (needed by
  the cost-basis engine) - current BEP-20 prices come from Moralis directly.
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` - an Upstash Redis instance (the Vercel KV integration
  sets these same variable names automatically when attached to the project). This backs the
  server-side cache. **Local dev works without it** - caching is just skipped and every request
  hits Moralis/CoinGecko directly, so expect to hit rate limits faster locally.

```bash
npm run dev
```

Open `http://localhost:3000/ai` (the app is mounted at the `/ai` base path even locally, to match
production).

## Architecture

- `src/lib/moralis.ts`, `src/lib/coingecko.ts` - thin API clients, called only from server code
  (`src/app/api/**/route.ts`) so API keys never reach the browser.
- `src/lib/errors.ts` - a `RateLimitError` class thrown by both clients on a 429/quota-exceeded
  response, plus a shared `apiErrorResponse()` used by every API route so the client can tell "an
  upstream rate limit" apart from any other failure.
- `src/lib/cache.ts` - Upstash Redis get/set-with-TTL wrapper, plus wallet-scoped cache
  invalidation used by the refresh button.
- `src/lib/ledger.ts` - flattens Moralis's decoded wallet history (which already groups native +
  BEP-20 transfers per tx and categorizes sends/receives/swaps/contract calls) into the app's
  `Holding[]` / `Transaction[]` / accounting `Lot[]` & `Disposal[]` shapes, and reconstructs the
  portfolio-value-over-time series from the same data (no extra API calls).
- `src/lib/accounting/` - the cost-basis engine. `CostBasisStrategy` is a small interface
  (`fifo.ts`, `lifo.ts`, `average.ts` each implement it); `engine.ts` replays a token's lot
  history against its disposals through whichever strategy is selected (`?method=` query param,
  default `fifo`) to produce realized/unrealized gains, short vs. long-term (365-day threshold),
  and tax-year grouping.
- `src/lib/csv.ts` - builds the tax-reporting CSV from realized `GainResult[]`.
- `src/components/SwrProvider.tsx` - a single app-wide SWR cache (wrapping the root layout, which
  stays mounted across client-side navigation) so data fetches once per page per browser session
  and only refetches when the **Refresh Data** button is clicked - not on tab focus, reconnect, or
  navigating between pages. It also disables SWR's automatic error-retry loop, so a failed fetch
  stays failed (with a visible Retry) instead of silently hammering the API in the background.
- `src/hooks/*` - one SWR hook per API route, each exposing a `rateLimited` flag. When an upstream
  rate limit hits and there's already-loaded data for that page (SWR keeps the last successful
  result around even after a failed refetch), the page keeps showing that stale data instead of a
  hard error, and **Refresh Data** greys out with the reason shown next to it.

### Known simplifications

- Gas paid in BNB is shown in the transaction list (BNB and USD) but is **not** itself treated as
  a taxable disposal of BNB for gains purposes - only outbound sends/swaps of a token count.
- The "average cost" method pools cost basis correctly, but the acquisition date used for its
  short/long-term split is a quantity-weighted average across the pool, since average cost isn't
  a method the IRS formally recognizes for crypto - treat it as a rough approximation, and prefer
  FIFO or LIFO if you need a defensible cost-basis method for filing.
- Tokens Moralis flags as `possible_spam` (common with unsolicited airdrops) are filtered out of
  both holdings and transaction history.
- Tax year / long-term threshold logic assumes US rules (calendar tax year, 1-year long-term
  threshold). Adjust `LONG_TERM_THRESHOLD_DAYS` in `src/lib/config.ts` if that doesn't apply to
  you.
- The stale-data-on-rate-limit fallback is client-side only (this browser session's SWR cache) -
  without Redis configured, a cold page load during an active rate-limit outage has nothing to
  fall back to and shows the normal error state instead.

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
indefinitely since they never change) to stay within Moralis/CoinGecko's free-tier rate limits.
There's no polling - each page fetches once per browser session, and the **Refresh Data** button
on every page clears this wallet's cached entries and re-fetches (it's greyed out instead of
clickable while an upstream rate limit is active).
