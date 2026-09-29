# MES Crypto Portfolio

Combined read-only portfolio, transaction history, and tax report across every wallet tracked by
the `sov/`, `ai/`, and `mfa/` trackers. Deployed to production at **mes.fm/portfolio** (Overview,
Transactions) and **mes.fm/taxes** (the tax report) - two public URLs, one Vercel deployment.

This app has **no wallet, private key, or seed phrase of its own** - it doesn't talk to any chain
API, Moralis, CoinGecko, or NodeReal directly. It fetches the already-computed, already-cached
data from the `sov/`, `ai/`, and `mfa/` apps' own production APIs and combines it: total value,
24h change, merged holdings, merged transaction history, and a merged FIFO/LIFO/average tax
report, with links out to each wallet's full dashboard.

`sov/`, `ai/`, and `mfa/` each used to have their own Transactions and Gains pages too. Those pages
are gone (2026-09-29) - each app's `/api/transactions` and `/api/gains` routes are unchanged and
still power the combined views here, but the redundant per-wallet UI is retired in favor of one
place to look. Their own nav now links "Transactions" and "Taxes" out to
`mes.fm/portfolio/transactions?wallet=<key>` and `mes.fm/taxes?wallet=<key>`, pre-filtered to that
wallet.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts + SWR, deployed to Vercel as its own
project - same architecture as `sov/`/`ai/`/`mfa/` (see their READMEs). Also now uses Upstash
Redis (`@upstash/redis`), added for the Taxes page - see "Taxes" below.

## Setup

```bash
cd crypto
npm install
cp .env.example .env.local
```

`.env.local` only needs to override the three source URLs if the `sov`/`ai`/`mfa` deployments ever
move, and the two `KV_*` vars for the Taxes page's Redis cache/label store - see
[`.env.example`](.env.example). The source URLs default to the URLs already wired into
`../mes.fm/vercel.json`'s rewrites; without the `KV_*` vars, everything still works locally, just
without persistence (see "Taxes" below).

```bash
npm run dev
```

Open `http://localhost:3000/crypto` (the app is mounted at the `/crypto` base path even locally,
to match production). Local dev fetches from the **production** `sov`/`ai`/`mfa` deployments by
default (there's no local combine-of-three-local-dev-servers mode), so you'll see real data even
before deploying this app. Note: `sov`'s production deployment currently has Vercel's own
Deployment Protection enabled, which blocks this kind of server-to-server fetch (a separate,
unrelated issue from anything in this app) - `sov`'s rows just come back empty until that's fixed
on the `mes-fm-sov` Vercel project's settings.

## Architecture

- `src/lib/wallets.ts` + `src/lib/sources.ts` - the three upstream wallet sources (`sov`, `ai`,
  `mfa`): each one's label, dashboard link, and production API base URL.
- `src/lib/combine.ts` - `fetchSource()`/`fetchAllSources()`, the shared fetch-and-settle helper
  every API route uses. A single wallet's fetch failing (rate limit, outage, or Vercel deployment
  protection - see above) never throws - it comes back as a per-source result with `data: null`,
  so the combined view degrades to "one wallet's data, flagged" instead of a hard error, as long
  as at least one source responds.
- `src/app/api/**/route.ts` - one route per combined view (`portfolio`, `portfolio/history`,
  `transactions`, `taxes`, `taxes/export`, `taxes/labels`, `refresh`), each calling the upstream
  apps' equivalent route and merging:
  - **portfolio**: sums each wallet's value/24h change, merges holdings by token symbol.
  - **portfolio/history**: merges the step-series into one by forward-filling each wallet's
    last-known value at every timestamp any one changed - not just concatenation, so the combined
    chart is an actual combined total over time.
  - **transactions**: concatenates all three wallets' lists, each item tagged with which wallet it
    came from (`SourcedTransaction` in `src/lib/types.ts`), sorted/filterable across all three
    (including by `?wallet=`, which the Transactions page seeds from the URL on load).
  - **taxes** (was `gains`): concatenates all three wallets' FIFO/LIFO/average results
    (`SourcedGainResult` in `src/lib/types.ts`), then enriches each row into a `TaxRow`: CAD
    amounts (`src/lib/cadRate.ts`) and a label if one has been set (`src/lib/labels.ts`). Supports
    `?wallet=` the same way.
  - **taxes/export**: CSV with both USD and CAD columns plus the label/notes/screenshot-links
    columns, sorted by disposal date.
  - **taxes/labels**: `GET` lists every label, `PUT` upserts one (`{id, tag, notes,
    screenshotUrls}`), `DELETE` removes one.
  - **refresh**: POSTs to all three upstream apps' own `/api/refresh` (which invalidate *their*
    Redis caches) so this app's manual refresh also busts the underlying per-wallet caches.
- `src/components/WalletBreakdown.tsx` - the per-group summary cards on the overview page; each
  links to that group's `linkPath` (`/sov`, `/ai`, or `/mfa`).
- Everything else (`SwrProvider`, `StateView`, `RefreshButton`, chart/table components, hooks) is
  the same pattern as `sov/`/`ai/`/`mfa/`, adapted for the combined/tagged data shapes.

### Taxes (`mes.fm/taxes`)

The one genuinely new feature here, and the actual point of this page: replacing a hand-kept Excel
sheet for personal tax-time bookkeeping.

- **CAD conversion** (`src/lib/cadRate.ts`): CRA's own guidance (Income Tax Folio S5-F4-C1) is to
  convert each transaction at the exchange rate in effect *on that transaction's own date*, not one
  blended annual average - so a disposal's proceeds are converted at its disposition-date rate, and
  its cost basis at its own acquisition-date rate, independently. Rates come from the Bank of
  Canada's free, keyless Valet API and are cached forever once resolved (a published historical
  rate never changes) - a business-day fallback (up to 10 days back) covers weekends/holidays, per
  the Bank of Canada's own recommendation for a day with no published rate.
- **Labels, notes, and screenshot links** (`src/lib/labels.ts`): free-text tag (a few presets are
  offered - Trade, Gift, Personal transfer, Income, Other - but it's never a closed enum), a notes
  field, and a list of URLs, keyed per disposal row (`gainRowId()` in `src/lib/types.ts` - a
  disposal tx hash alone isn't unique, since one swap can dispose several lots/symbols in one
  hash). Stored in the same Upstash Redis every other app here uses for caching, but **without a
  TTL** - this is hand-entered data, not a re-fetchable cache entry, so nothing here ever expires.
  Upstash Redis is RDB-persistent by default, so this is a durable store, not just a cache; a real
  database (e.g. Vercel Postgres) would give stronger guarantees (backups, relational queries) at
  the cost of a new piece of infrastructure to provision - worth revisiting if this data becomes
  precious enough to want that.
- **Not included yet**: Hive accounts (`mes`, `mestruth`, `mathiew`, `artgrafiken`, tracked for
  balances in `mes.fm/assets`). No app in this repo has a cost-basis engine for Hive - curation
  rewards, HP delegation, and Hive Engine's internal market don't map onto the buy/sell model
  `sov`/`ai`/`mfa` use, so it needs its own design pass rather than a bolt-on here. When it is
  added, note that BTCB, WBTC, and Hive Engine's SWAP.BTC are all just wrapped Bitcoin and should
  pool into the same cost-basis key `sov` already uses for BTCB/WBTC, not be treated as separate
  assets.
- **Not tax advice.** This computes a mechanical FIFO/LIFO/average report from on-chain data; it
  doesn't know about gifts, personal transfers between your own wallets, or anything else that
  needs a human judgment call - that's what the labels are for, and a real accountant is still the
  right call at filing time.

### Known simplifications

- If **all three** upstream sources fail, the combined route returns a hard error; if only some
  fail, the combined view still renders with that wallet's card/section showing its error and
  excluded from the totals.
- Merged holdings sum `valueUsd` and `balanceFormatted` per token symbol across wallets, but keep
  only one wallet's `priceUsd`/`change24hPct` (the two should already agree, since both ultimately
  price against the same upstream price feeds).
- No caching layer for portfolio/transactions - each combined page load makes lightweight requests
  to already-cached upstream endpoints. Only the Taxes page's CAD rates and labels use Redis (see
  above).

## Deploying at mes.fm/portfolio and mes.fm/taxes

Same multi-zones pattern as `sov/`/`ai/`/`mfa/` (see any of their READMEs' "Deploying at
mes.fm/X" section for background):

1. **Deploy this project to Vercel** (`vercel`, rooted at this `crypto/` directory), with the
   `KV_REST_API_URL`/`KV_REST_API_TOKEN` env vars set (mark them **Secret**; give them Production
   **and** Preview) if you want the Taxes page's CAD-rate cache and labels to actually persist. No
   other env vars are required unless the `sov`/`ai`/`mfa` deployment URLs change from the
   defaults in [`.env.example`](.env.example).
2. **Rewrites in the main site**: `../mes.fm/vercel.json` already has entries for both
   `/portfolio` and `/taxes` pointing at this deployment (`/taxes` maps to this app's own
   `/crypto/taxes` route - it's one page inside this app, not a separate project). If your
   deployment URL differs from `mes-fm-crypto.vercel.app`, update both sets of rewrites.
3. **Password gate**: `../mes.fm/middleware.js`'s matcher already includes `/portfolio` and
   `/taxes` (shared realm with `/sov` and `/assets`, username `mes`, password `911`) - `/taxes`
   needs its own matcher entry even though it's served by the same deployment as `/portfolio`,
   since the matcher is path-based.
4. Redeploy the main `mes.fm` site for the rewrites/middleware change to take effect.

This app's `next.config.js` sets `basePath: '/crypto'` so its own routes and assets resolve
correctly whether hit directly at its Vercel URL, proxied in under `mes.fm/portfolio`, or proxied
in under `mes.fm/taxes`.
