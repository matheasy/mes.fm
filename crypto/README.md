# MES Crypto Portfolio

Combined read-only portfolio, transaction history, and capital-gains dashboard across every wallet
tracked by the `ai/` and `mfa/` trackers. Deployed to production at **mes.fm/crypto**.

This app has **no wallet, private key, or seed phrase of its own** - it doesn't talk to Moralis or
CoinGecko directly. It fetches the already-computed, already-cached data from the `ai/` and `mfa/`
apps' own production APIs and combines it: total value, 24h change, merged holdings, merged
transaction history, and merged realized/unrealized gains, with links out to each wallet's full
dashboard.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts, deployed to Vercel as its own
project - same architecture as `ai/` and `mfa/` (see their READMEs), minus the Moralis/CoinGecko/
Redis pieces those need and this one doesn't.

## Setup

```bash
cd crypto
npm install
cp .env.example .env.local
```

`.env.local` only needs to override the two source URLs if the `ai/`/`mfa/` deployments ever move
- see [`.env.example`](.env.example). Both default to the URLs already wired into
`../mes.fm/vercel.json`'s rewrites.

```bash
npm run dev
```

Open `http://localhost:3000/crypto` (the app is mounted at the `/crypto` base path even locally,
to match production). Local dev fetches from the **production** `ai`/`mfa` deployments by default
(there's no local combine-of-two-local-dev-servers mode), so you'll see real data even before
deploying this app.

## Architecture

- `src/lib/sources.ts` - the two upstream wallet sources (`ai`, `mfa`): each one's production API
  base URL and the path back to its full dashboard.
- `src/lib/combine.ts` - `fetchSource()`/`fetchAllSources()`, the shared fetch-and-settle helper
  every API route uses. A single wallet's fetch failing (rate limit, outage) never throws - it
  comes back as a per-source result with `data: null`, so the combined view degrades to
  "one wallet's data, flagged" instead of a hard error, as long as at least one source responds.
- `src/app/api/**/route.ts` - one route per combined view (`portfolio`, `portfolio/history`,
  `transactions`, `gains`, `gains/export`, `refresh`), each calling both upstream apps' equivalent
  route and merging:
  - **portfolio**: sums each wallet's value/24h change, merges holdings by token symbol.
  - **portfolio/history**: merges the two step-series into one by forward-filling each wallet's
    last-known value at every timestamp either one changed (see the route for the exact algorithm)
    - not just concatenation, so the combined chart is an actual combined total over time.
  - **transactions** / **gains**: concatenate both wallets' lists, each item tagged with which
    wallet it came from (`SourcedTransaction`, `SourcedGainResult` in `src/lib/types.ts` and
    `src/app/api/gains/route.ts`), sorted/filterable across both.
  - **gains/export**: same CSV shape as `ai/mfa`'s own export, with a leading Wallet column.
  - **refresh**: POSTs to both upstream apps' own `/api/refresh` (which invalidate *their* Redis
    caches) so this app's manual refresh also busts the underlying per-wallet caches.
- `src/components/WalletBreakdown.tsx` - the per-wallet summary cards on the overview page; each
  links to that wallet's `linkPath` (`/ai` or `/mfa`).
- Everything else (`SwrProvider`, `StateView`, `RefreshButton`, chart/table components, hooks) is
  the same pattern as `ai/`/`mfa/`, adapted for the combined/tagged data shapes.

### Known simplifications

- If **both** upstream sources fail, the combined route returns a hard error; if only one fails,
  the combined view still renders with that wallet's card showing its error and excluded from the
  totals - `WalletBreakdown` surfaces which wallet is degraded.
- Merged holdings sum `valueUsd` and `balanceFormatted` per token symbol across wallets, but keep
  only one wallet's `priceUsd`/`change24hPct` (the two should already agree, since both ultimately
  price against the same CoinGecko/Moralis feeds).
- No caching layer of its own - each combined page load makes two lightweight requests to already-
  cached upstream endpoints, so it doesn't need Redis or an API key budget.

## Deploying at mes.fm/crypto

Same multi-zones pattern as `ai/` and `mfa/` (see either README's "Deploying at mes.fm/X" section
for background):

1. **Deploy this project to Vercel** (`vercel`, rooted at this `crypto/` directory). No env vars
   are required unless the `ai`/`mfa` deployment URLs change from the defaults in
   [`.env.example`](.env.example). Note the deployment's URL (e.g. `https://mes-fm-crypto.vercel.app`).
2. **Add a rewrite in the main site**: in `../mes.fm/vercel.json`, add entries to the existing
   `rewrites` array (alongside the `ai`/`mfa` ones):

   ```json
   { "source": "/crypto", "destination": "https://mes-fm-crypto.vercel.app/crypto" },
   { "source": "/crypto/:path*", "destination": "https://mes-fm-crypto.vercel.app/crypto/:path*" }
   ```

   Replace the destination host with your actual deployment URL from step 1. Redeploy the main
   `mes.fm` site for the rewrite to take effect.

This app's `next.config.js` sets `basePath: '/crypto'` so its own routes and assets resolve
correctly whether it's hit directly at its Vercel URL or proxied in under `mes.fm/crypto`.
