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

- `src/lib/wallets.ts` + `src/lib/sources.ts` - the four upstream wallet sources: `main` (the Main
  wallet, 0xe6c0..., served by the `ai/` app via `?wallet=main` - see ai/src/lib/walletContext.ts;
  its BTCB/WBTC are left out there because `sov` counts them), `ai`, `mfa`, `sov`: each one's label,
  dashboard link, production API base URL and optional extra query string (`sourceUrl()`).
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
  - **taxes** / **taxes/export**: see "Taxes" below - built by `src/lib/tax/report.ts` from every
    source's `/api/ledger`, so the page and the CSV always agree.
  - **taxes/labels**: `GET` lists every label, `PUT` upserts one (`{id, tag, notes,
    screenshotUrls}`), `DELETE` removes one.
  - **refresh**: POSTs to all three upstream apps' own `/api/refresh` (which invalidate *their*
    Redis caches) so this app's manual refresh also busts the underlying per-wallet caches.
- `src/components/WalletBreakdown.tsx` - the per-group summary cards on the overview page; each
  links to that group's `linkPath` (`/sov`, `/ai`, or `/mfa`).
- Everything else (`SwrProvider`, `StateView`, `RefreshButton`, chart/table components, hooks) is
  the same pattern as `sov/`/`ai/`/`mfa/`, adapted for the combined/tagged data shapes.

### Taxes (`mes.fm/taxes`)

Replaces a hand-kept Excel sheet for Canadian tax-time bookkeeping. **Rebuilt 2026-09-29** around the
CRA's actual rule instead of per-wallet FIFO/LIFO:

- **One adjusted-cost-base (ACB) calculation across every wallet** (`src/lib/tax/acb.ts`). The CRA
  treats all units of the same crypto you own as identical property: one pool per asset, average
  cost, whatever wallet or chain holds it; FIFO/LIFO aren't allowed. So each source app now exposes
  `GET /api/ledger` (every priced transfer leg with from/to, unpaginated) and this app runs the
  accounting itself over the merged timeline. The per-app `/api/gains` routes (per-wallet FIFO/LIFO/
  average) still exist for those apps' own use, but the Taxes page no longer reads them.
- **Own-wallet transfers are skipped** (`src/lib/tax/ownAddresses.ts` - every address/account on
  mes.fm/assets; keep the two lists in step). Same-asset legs inside one transaction are netted
  (a BNB->WBNB wrap isn't a sale). Pools by asset, not contract (`src/lib/tax/assetKey.ts`):
  BTCB/WBTC/SWAP.BTC -> BTC, WETH/bridged ETH -> ETH, WBNB -> BNB.
- **CAD throughout** (`src/lib/cadRate.ts`): every leg converted at the Bank of Canada rate of its
  own date (CRA, Income Tax Folio S5-F4-C1), and the pools themselves kept in CAD - ACB is a CAD
  figure. Rates are cached forever once resolved (one Redis `mget` per page load).
- **Labels, notes, and screenshot links** (`src/lib/labels.ts`): keyed per disposition row
  (`disposalId()` in acb.ts), stored in Upstash Redis **without a TTL** (hand-entered data, the only
  copy). A row labelled **Personal transfer** (e.g. XRP sent to the owner's own Shakepay account,
  whose deposit address can't be recognised as theirs) leaves the pool at cost with no gain.
- Units disposed that the tracked history never shows arriving get a cost of 0 and are flagged on
  the page (`uncoveredQuantity`).
- **Not included yet**: Hive accounts (HIVE/HBD, Hive Engine tokens other than sov's TGLD), the
  native Bitcoin address, Hyperliquid perpetuals, rewards as *income* (they only set the cost of
  what was received), gas fees in cost/proceeds, the superficial-loss rule. When Hive is added,
  SWAP.BTC / SWAP.HIVE / SWAP.HBD already pool with BTC / HIVE / HBD via assetKey.ts.
- **Not tax advice** - a record-keeping aid; an accountant should check it before filing.

### Known simplifications

- If **every** upstream source fails, the combined route returns a hard error; if only some
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
