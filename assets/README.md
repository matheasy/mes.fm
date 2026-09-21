# MES Assets

One page for **everything the owner holds** - Hive, Hive Engine, Magi, the three EVM wallets
(Ethereum / Arbitrum / Polygon / Base / Optimism / BNB Chain / Hyperliquid) and XRP - showing every
asset worth **$10 or more**, liquidity-pool positions included. Deployed to **mes.fm/assets**
(behind the light password gate in the root `mes.fm/middleware.js`, shared with `/portfolio` and `/sov`).

It is also meant to be the **only app that calls chain/price APIs**. Its `/api/holdings` feed is what
the other dashboards (`ai/`, `mfa/`, `sov/`, `crypto/` = mes.fm/portfolio) read instead of each
hitting NodeReal / Etherscan / CoinGecko / Hyperliquid themselves - one fetch, one cache, one
throttle, one CoinGecko bill.

Read-only. It never asks for or handles a private key or seed phrase.

## What it tracks

Addresses live in [`src/lib/config.ts`](src/lib/config.ts) (`GROUPS`), not in env vars.

| Group | Account | Sources |
| --- | --- | --- |
| **Hive @mes** | Hive account `mes` | Hive L1 (HIVE, HBD, Hive Power, savings, unclaimed rewards) · Hive Engine (every token, liquid + staked, plus `marketpools` LPs) · Magi (HIVE/HBD, bridged BTC, DEX LP positions) |
| **Main wallet** | `0xe6c0…5ef9` | Ethereum, Arbitrum, Polygon, Base, Optimism, BNB Chain, Hyperliquid |
| **AI Trading wallet** | `0x89ac…e492` (mes.fm/ai) | same seven |
| **MikeFA wallet** | `0xaef8…04a5` (mes.fm/mfa) | same seven |
| **XRP Ledger** | `rDqSZ…KkDNh` | XRP balance |

### How each source is read

| Source | How | Key needed |
| --- | --- | --- |
| Hive L1 | `condenser_api.get_accounts` + `get_dynamic_global_properties` (VESTS → HP) | no |
| Hive Engine | `tokens.balances` (one call) + `market.metrics` for prices (batched, in HIVE) + `marketpools` | no |
| Magi | GraphQL `getAccountBalance("hive:mes")`; BTC from the mapping contract state (`a-hive:mes`, sats); LPs from the Hasura indexer (`dex_pool_lp_positions` / `dex_pool_liquidity`) | no |
| Ethereum / Arbitrum / Polygon / Base / Optimism | Blockscout `token-balances` - returns each token **with a USD price**, so spam (no price / `reputation: scam`) drops out on its own | no |
| BNB Chain | NodeReal transfer scan **once per 12h** to discover tokens → exact `balanceOf` via one JSON-RPC batch on a public node → CoinGecko by contract | `NODEREAL_API_KEY` |
| Hyperliquid | public info API: spot (priced from USDC pairs), perps equity, vaults, HYPE staking; native HYPE on HyperEVM via RPC | no |
| XRP | XRPL `account_info` | no |
| LPs on EVM | Uniswap-V3-style NFT positions (Uniswap V3, PancakeSwap V3; amounts from liquidity + tick range + pool price, plus unclaimed fees via a `collect` dry-run) and V2-style pair tokens - public RPC, only probed when a wallet shows signs of one | no |
| Prices | CoinGecko `simple/price` (one call for HIVE, HBD, BTC, ETH, BNB, XRP, HYPE, POL) | `COINGECKO_API_KEY` recommended |

## The `$10` rule

`minValueUsd` (default **10**) is a **filter on the response, not a limit on what is collected**.
Everything priced above a cent is cached; `/api/holdings?minValueUsd=0` returns it all. That matters
for the dashboards that will read this feed: `mes.fm/ai` and `mes.fm/mfa` show small balances and
need history for tokens that have since been sold, so they ask for `minValueUsd=0`.

## API

`GET /assets/api/holdings?minValueUsd=10&group=main&source=ethereum` →
`{ data: { fetchedAt, minValueUsd, totalUsd, totalAllUsd, hiddenCount, hiddenUsd, groups[], holdings[], sources[] } }`

* `groups[]` always covers **all** groups (so tabs keep their totals when one is selected).
* `holdings[]` is filtered by `minValueUsd` / `group` / `source` and sorted by value. Each row:
  `group, source, kind (token | staked | savings | reward | lp | vault | perp), symbol, label, contract,
  amount, priceUsd, valueUsd, change24hPct, detail, thin?, lp?{pool, share, legs[]}`.
* `sources[]` is per-(group, source) health: ok / stale / error / note, count, fetchedAt.

`POST /assets/api/refresh` clears cached holdings + prices (not the 12h BNB Chain discovery).

## Caching & credit usage

* Per source: holdings **10 min**, prices **3 min** (CoinGecko token prices 10 min, misses cached too),
  BNB Chain discovery **12 h**. Concurrent requests for the same key are de-duplicated.
* `cachedStale` keeps the last good copy for a week: if a source fails on refresh you get the stale
  data flagged in the **Data sources** panel instead of a blank card.
* Every provider call is spaced by a per-host throttle (Redis-backed, so it holds across serverless
  instances).

## Valuation notes (read these before trusting a number)

* **Hive Engine tokens are valued at the last trade** (`lastPrice` × HIVE/USD) - the same convention
  the Hive Engine / Tribaldex wallets use. Illiquid tokens can be far from what you could sell for,
  so rows whose best bid is below 25% of the last trade carry a yellow **thin** badge (e.g. TGLD).
* **Hive Power** is `vesting_shares` converted at the current VESTS→HP ratio; it includes HP you have
  delegated out and excludes HP delegated to you (shown in the row's detail).
* **Constant-product LPs** (Hive Engine, Magi, Uniswap V2) are valued as 2× the CoinGecko-priced leg
  when there is one, so a stale-priced small token can't skew the pool.
* **Hyperliquid perps** show account equity (margin balance incl. unrealised PnL), not per-position PnL.
* XRP shows the ledger balance, which includes the account reserve.

## Setup

```bash
cd assets
npm install
cp .env.example .env.local   # COINGECKO_API_KEY, NODEREAL_API_KEY, KV_* (all optional locally)
npm run dev
```

Open `http://localhost:3000/assets`. Everything except BNB Chain tokens works with no keys at all.

## Deploying at mes.fm/assets

Same multi-zones pattern as `ai/` / `mfa/` / `sov/` / `crypto/`:

1. **New Vercel project `mes-fm-assets`**, root directory `assets/`. Env vars from
   [`.env.example`](.env.example): `COINGECKO_API_KEY`, `NODEREAL_API_KEY`, `KV_REST_API_URL`,
   `KV_REST_API_TOKEN` (mark the keys **Secret**; give them Production **and** Preview).
2. The `/assets` + `/assets/:path*` rewrites are already in `../mes.fm/vercel.json` and the
   password gate in `../mes.fm/middleware.js` (username: anything; password `mes911`).
3. Redeploy `mes.fm`.

`vercel.json` here carries the `ignoreCommand` that keeps this project from rebuilding on commits
that don't touch `assets/`.

> The direct `mes-fm-assets.vercel.app/assets/...` URL is not behind the password (the gate lives on
> the `mes.fm` domain), same as the other tracker apps' `.vercel.app` URLs. The page sets
> `noindex`; nothing here is a hardened secret.

## Cutting `ai/` and `mfa/` over (next step)

Not done yet. Once this is deployed and the numbers check out against the Hive/Hyperliquid/explorer
wallets: replace the holdings half of `ai/src/lib/networks/*` and `mfa/src/lib/ledger.ts` with a call to
`/api/holdings?group=ai&minValueUsd=0` (resp. `group=mfa`). **Transactions / cost-basis history still
come from their own modules** - this app deliberately holds balances, not ledgers - so a follow-up
`/api/ledger` (reusing `ai/`'s per-network transaction code, parameterised by wallet) is what would let
those two stop calling NodeReal/Etherscan for history as well.

## Known limitations

* BEP-20 tokens on BNB Chain need `NODEREAL_API_KEY`; discovery only looks at tokens *received* by the wallet.
* Hyperliquid's HyperEVM token balances (beyond native HYPE) and Hive Engine NFTs are not tracked.
* Pool/LP positions on EVM chains are only detected for Uniswap V3 / PancakeSwap V3 and V2-style pairs;
  farms/gauges that custody the LP token elsewhere (staked LP) are not followed.
* Lending receipt tokens (aTokens, cTokens) appear only if Blockscout/CoinGecko price them.
* Not tax or investment advice.
