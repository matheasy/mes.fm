# MES Store of Value

Read-only tracker for a **fixed set of long-term holdings**, deployed to production at
**mes.fm/sov** (behind a light password gate - see the root `mes.fm/middleware.js`).

Unlike the `ai/` and `mfa/` trackers (which follow one wallet across whatever it holds), this app
tracks three specific assets from three hardcoded addresses:

| Source | Address | Tracked | Provider |
| --- | --- | --- | --- |
| **Bitcoin** | `0xe6c0634d02ae5f136500ac9428ed5d9576695ef9` | BTCB (BNB Chain) + WBTC (Polygon) + WBTC (Ethereum), **all accounted as one "BTC" position** | NodeReal (BSC) + Etherscan V2 (`chainid` 137 / 1) |
| **XRP** | `rDqSZAsxSEBoTgPGDbSqKEtrEe4JxKkDNh` | XRP (Payment transactions only) | XRPL public JSON-RPC (keyless) |
| **TGLD** | Hive account `mes` | TGLD on Hive Engine (liquid + staked) | api.hive-engine.com + history.hive-engine.com (keyless) |

It's **read-only** and never handles a private key or seed phrase.

## Stack

Next.js 14 (App Router) + TypeScript + Tailwind CSS + Recharts, deployed to Vercel as its own
project - same architecture as `ai/` / `mfa/`. Shares their cost-basis engine (`src/lib/accounting/`),
caching (`src/lib/cache.ts`), and most UI components verbatim.

## How it works

- **`src/lib/config.ts`** - the three addresses, the BTC-pegged token contracts per chain, and
  the synthetic combined-BTC asset key.
- **`src/lib/sources/`** - one module per source, each returning the common `SourceLedgerData`
  shape (`holdings`, `transactions`, `lots`, `disposals`, `pricedTransactions`):
  - `bitcoin.ts` - fetches each chain's transfer feed for its one BTC-pegged contract, normalizes
    every leg to a BTC-denominated amount sharing the synthetic `'BTC'` token key, so holdings
    show one row and the cost-basis engine runs **one pooled FIFO/LIFO/average queue across all
    three chains**. Priced off CoinGecko `bitcoin` spot (WBTC/BTCB track BTC ~1:1).
  - `xrp.ts` - native XRP balance + `account_tx` history, filtered to successful `Payment`
    transactions delivering XRP (issued-currency payments, DEX offers, trust lines, AMM ops are
    out of scope). Handles both rippled and Clio response shapes.
  - `tgld.ts` - Hive Engine `tokens`/`balances` (liquid + staked) and per-account history.
    TGLD isn't on CoinGecko, so value = (HIVE per TGLD) x (HIVE/USD from CoinGecko). Cost basis
    for a market fill uses the **HIVE actually paid** (`quantityHive`) converted at that date's
    HIVE/USD - the real value of the purchase, never zero. Plain transfers fall back to that
    date's TGLD spot (approximate).
- **`src/lib/ledger.ts`** - fans out over the three sources with `Promise.allSettled` (one source
  failing shows an inline banner, doesn't blank the page) and aggregates.
- **`src/app/api/**`** - `portfolio`, `portfolio/history`, `transactions`, `gains`,
  `gains/export`, `refresh` - same shapes as `ai/`/`mfa/`, so the `crypto/` aggregator behind
  **mes.fm/portfolio** can pull this app in as a third source (`SOV_SOURCE_URL`).

The overview page's "Total Portfolio Value" is the combined BTC + XRP + TGLD sum.

## Setup

```bash
cd sov
npm install
cp .env.example .env.local   # fill in NODEREAL_API_KEY, ETHERSCAN_API_KEY, COINGECKO_API_KEY, KV_*
npm run dev
```

Open `http://localhost:3000/sov` (the app is mounted at the `/sov` base path even locally, to
match production). Without Redis configured locally, caching is skipped but everything works.

## Deploying at mes.fm/sov

Same multi-zones pattern as `ai/` / `mfa/` / `crypto/`:

1. **Deploy this project to Vercel** rooted at this `sov/` directory. Set the env vars from
   [`.env.example`](.env.example) in the Vercel project settings. Note the deployment URL (e.g.
   `https://mes-fm-sov.vercel.app`).
2. **Add a rewrite in the main site**: in `../mes.fm/vercel.json`, alongside the `ai`/`mfa`/
   `portfolio` entries:

   ```json
   { "source": "/sov", "destination": "https://mes-fm-sov.vercel.app/sov" },
   { "source": "/sov/:path*", "destination": "https://mes-fm-sov.vercel.app/sov/:path*" }
   ```

3. **Password gate**: `../mes.fm/middleware.js`'s matcher already includes `/sov` and
   `/sov/:path*` (shared realm with `/portfolio`, password `mes911`).
4. **Fold into mes.fm/portfolio**: set `SOV_SOURCE_URL=https://mes-fm-sov.vercel.app/sov` on the
   existing `mes-fm-crypto` Vercel project so the combined portfolio view includes this basket.

`next.config.js` sets `basePath: '/sov'` so routes, assets, and API calls resolve whether hit
directly or proxied under `mes.fm/sov`.

## Known simplifications

- **BTC pricing** treats BTCB and WBTC as exactly BTC. Their pegs can drift a few basis points;
  not modeled.
- **XRP** ingests only `Payment` transactions. XRP moved via DEX offers/AMM is not counted.
- **TGLD spot fallback** (for non-market transfers) uses the *current* HIVE/TGLD ratio against
  the historical HIVE/USD, since Hive Engine exposes no historical token price. Market fills use
  their real per-fill HIVE amount and are unaffected.
- Staking/unstaking TGLD is not treated as an acquisition or disposal.
- Gas/fees are only tracked for XRP ledger sends; EVM gas and Hive resource credits are ignored.
- Not tax advice.
