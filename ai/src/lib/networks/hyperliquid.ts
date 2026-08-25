import { cached, cacheKey } from '../cache';
import { CACHE_TTL_SECONDS, NATIVE_TOKENS, WALLET_ADDRESS } from '../config';
import * as coingecko from '../coingecko';
import type { Disposal, Lot } from '../accounting/types';
import type { Holding, Token, Transaction } from '../types';
import * as api from './hyperliquidApi';
import * as hyperevm from './hyperevm';
import { formatUnits } from '../units';
import type { HyperliquidPerpSummary, NetworkLedgerData, PerpFill, PerpPosition, PricedTransaction } from './types';

const NETWORK = 'hyperliquid' as const;
const FILL_LOOKBACK_MS = 1000 * 60 * 60 * 24 * 365 * 3; // ~3 years, bounded by hyperliquidApi's own MAX_FILL_PAGES cap

const PERP_EQUITY_TOKEN: Token = {
  contractAddress: 'HL-PERP-EQUITY',
  symbol: 'USDC',
  name: 'Hyperliquid Perps Account Equity',
  decimals: 2,
  isNative: false,
  coingeckoId: null,
  network: NETWORK,
};

/** Distinguishes spot fills ("PURR/USDC" or "@N" index form) from perp fills (bare coin name, e.g. "BTC") */
function isSpotCoin(coin: string): boolean {
  return coin.includes('/') || coin.startsWith('@');
}

function resolveSpotPair(
  coin: string,
  meta: api.SpotMeta,
): { base: api.SpotMetaToken; quote: api.SpotMetaToken; displayName: string } | null {
  if (coin.includes('/')) {
    const [baseName, quoteName] = coin.split('/');
    const base = meta.tokens.find((t) => t.name === baseName);
    const quote = meta.tokens.find((t) => t.name === quoteName);
    if (!base || !quote) return null;
    return { base, quote, displayName: coin };
  }

  const index = Number(coin.slice(1));
  const pair = meta.universe.find((u) => u.index === index);
  if (!pair) return null;
  const base = meta.tokens.find((t) => t.index === pair.tokens[0]);
  const quote = meta.tokens.find((t) => t.index === pair.tokens[1]);
  if (!base || !quote) return null;
  return { base, quote, displayName: pair.name };
}

/** Best-effort current USD price for a spot holding via allMids, assuming (as is typical on Hyperliquid) a USDC quote */
function priceSpotHolding(symbol: string, meta: api.SpotMeta, mids: Record<string, string>): number | null {
  if (symbol === 'USDC') return 1;

  const direct = mids[`${symbol}/USDC`];
  if (direct) return Number(direct);

  const pair = meta.universe.find((u) => meta.tokens.find((t) => t.index === u.tokens[0])?.name === symbol);
  if (!pair) return null;
  const mid = mids[pair.name] ?? mids[`@${pair.index}`];
  return mid ? Number(mid) : null;
}

/** Single cached fetch of everything Hyperliquid-related, shared by getNetworkLedgerData() and getPerpSummary() so both draw from one set of upstream calls */
async function getRawData() {
  const key = cacheKey('rawwallet', WALLET_ADDRESS, NETWORK);
  return cached(key, CACHE_TTL_SECONDS.transactions, async () => {
    const [spot, meta, mids, fills, hyperEvmBalanceWei, clearinghouseState] = await Promise.all([
      api.getSpotClearinghouseState(WALLET_ADDRESS),
      api.getSpotMeta(),
      api.getAllMids(),
      api.getFillsSince(WALLET_ADDRESS, Date.now() - FILL_LOOKBACK_MS),
      hyperevm.getNativeBalanceWei(WALLET_ADDRESS),
      api.getClearinghouseState(WALLET_ADDRESS),
    ]);
    return { spot, meta, mids, fills, hyperEvmBalanceWei, clearinghouseState };
  });
}

async function getSpotHoldings(spot: { balances: api.SpotBalance[] }, meta: api.SpotMeta, mids: Record<string, string>): Promise<Holding[]> {
  const holdings: Holding[] = [];

  for (const b of spot.balances) {
    const total = Number(b.total);
    if (total <= 0) continue;

    const price = priceSpotHolding(b.coin, meta, mids);
    const token: Token = {
      contractAddress: `hl-spot-${b.token}`,
      symbol: b.coin,
      name: b.coin,
      decimals: meta.tokens.find((t) => t.index === b.token)?.weiDecimals ?? 8,
      isNative: false,
      coingeckoId: null,
      network: NETWORK,
    };

    holdings.push({
      token,
      balance: b.total,
      balanceFormatted: total,
      priceUsd: price,
      valueUsd: price !== null ? total * price : null,
      change24hPct: null, // Hyperliquid's info API doesn't surface 24h change on spot balances
    });
  }

  return holdings;
}

async function getHyperEvmHolding(balanceWei: string): Promise<Holding> {
  const nativeToken = NATIVE_TOKENS.hyperliquid;
  const balanceFormatted = formatUnits(balanceWei, 18);
  const price = balanceFormatted > 0
    ? await cached(cacheKey('price', 'native', NETWORK), CACHE_TTL_SECONDS.currentPrice, () =>
        coingecko.getCurrentPrice(nativeToken.coingeckoId!),
      ).catch(() => null)
    : null;

  return {
    token: nativeToken,
    balance: balanceWei,
    balanceFormatted,
    priceUsd: price?.usd ?? null,
    valueUsd: price ? balanceFormatted * price.usd : null,
    change24hPct: price?.usd24hChange ?? null,
  };
}

function normalizeSide(side: string): 'buy' | 'sell' {
  return side === 'B' || side.toLowerCase() === 'buy' ? 'buy' : 'sell';
}

/** Spot fills only - perp fills feed getPerpSummary() instead, kept out of the general transaction/lot feed entirely */
function buildSpotLedger(fills: api.Fill[], meta: api.SpotMeta): { transactions: Transaction[]; lots: Lot[]; disposals: Disposal[]; pricedTransactions: PricedTransaction[] } {
  const transactions: Transaction[] = [];
  const lots: Lot[] = [];
  const disposals: Disposal[] = [];
  const pricedTransactions: PricedTransaction[] = [];

  const spotFills = fills.filter((f) => isSpotCoin(f.coin));
  for (const fill of spotFills) {
    const pair = resolveSpotPair(fill.coin, meta);
    if (!pair || pair.quote.name !== 'USDC') continue; // non-USDC-quoted pairs need a second price leg - not modeled (documented limitation)

    const side = normalizeSide(fill.side);
    const size = Number(fill.sz);
    const price = Number(fill.px);
    const timestamp = new Date(fill.time).toISOString();
    // Buying the base asset with USDC is a disposal of USDC and an acquisition of the base asset;
    // USDC itself is treated as a cash equivalent (priced at $1) and isn't run through cost-basis lots.
    const amount = side === 'buy' ? size : -size;

    const token: Transaction['token'] = { symbol: pair.base.name, contractAddress: `hl-spot-${pair.base.index}`, isNative: false };
    const tx: Transaction = {
      hash: `hl-fill-${fill.tid}`,
      network: NETWORK,
      timestamp,
      type: 'swap',
      token,
      from: side === 'buy' ? 'USDC' : WALLET_ADDRESS,
      to: side === 'buy' ? WALLET_ADDRESS : 'USDC',
      amount,
      gasUsedNative: 0,
      gasUsedUsd: null,
      methodLabel: 'Hyperliquid Spot Trade',
    };
    transactions.push(tx);
    pricedTransactions.push({ ...tx, priceUsd: price });

    if (amount > 0) {
      lots.push({
        id: `hl-fill-${fill.tid}`,
        txHash: tx.hash,
        network: NETWORK,
        tokenSymbol: token.symbol,
        contractAddress: token.contractAddress,
        acquiredAt: timestamp,
        quantity: amount,
        remainingQuantity: amount,
        costBasisUsdPerUnit: price,
      });
    } else {
      disposals.push({
        txHash: tx.hash,
        network: NETWORK,
        tokenSymbol: token.symbol,
        contractAddress: token.contractAddress,
        disposedAt: timestamp,
        quantity: -amount,
        proceedsUsdPerUnit: price,
      });
    }
  }

  return { transactions, lots, disposals, pricedTransactions };
}

export async function getNetworkLedgerData(): Promise<NetworkLedgerData> {
  const raw = await getRawData();
  const [spotHoldings, hyperEvmHolding] = await Promise.all([
    getSpotHoldings(raw.spot, raw.meta, raw.mids),
    getHyperEvmHolding(raw.hyperEvmBalanceWei),
  ]);
  const { transactions, lots, disposals, pricedTransactions } = buildSpotLedger(raw.fills, raw.meta);
  const perpEquityHolding = perpEquityHoldingFromState(raw.clearinghouseState);

  return { holdings: [hyperEvmHolding, ...spotHoldings, perpEquityHolding], transactions, lots, disposals, pricedTransactions };
}

/** No gas or CoinGecko-resolved historical pricing applies to Hyperliquid's transaction feed (spot fills carry their own execution price) */
export async function resolveHistoricalPrice(): Promise<number | null> {
  return null;
}

function toPerpPosition(raw: api.PerpPositionRaw): PerpPosition {
  const p = raw.position;
  return {
    coin: p.coin,
    sizeUnits: Number(p.szi),
    entryPriceUsd: Number(p.entryPx),
    positionValueUsd: Number(p.positionValue),
    unrealizedPnlUsd: Number(p.unrealizedPnl),
    liquidationPriceUsd: p.liquidationPx !== null ? Number(p.liquidationPx) : null,
  };
}

export async function getPerpSummary(): Promise<HyperliquidPerpSummary> {
  const raw = await getRawData();
  return perpSummaryFromRaw(raw.clearinghouseState, raw.fills);
}

function perpSummaryFromRaw(state: api.ClearinghouseState, fills: api.Fill[]): HyperliquidPerpSummary {
  const perpFills = fills.filter((f) => !isSpotCoin(f.coin));
  const positions = state.assetPositions.map(toPerpPosition);

  const recentFills: PerpFill[] = perpFills
    .slice()
    .sort((a, b) => b.time - a.time)
    .slice(0, 50)
    .map((f) => ({
      coin: f.coin,
      time: new Date(f.time).toISOString(),
      side: normalizeSide(f.side),
      sizeUnits: Number(f.sz),
      priceUsd: Number(f.px),
      closedPnlUsd: Number(f.closedPnl),
    }));

  return {
    accountEquityUsd: Number(state.marginSummary.accountValue),
    realizedPnlUsd: perpFills.reduce((sum, f) => sum + Number(f.closedPnl), 0),
    unrealizedPnlUsd: positions.reduce((sum, p) => sum + p.unrealizedPnlUsd, 0),
    positions,
    recentFills,
  };
}

function perpEquityHoldingFromState(state: api.ClearinghouseState): Holding {
  const accountEquityUsd = Number(state.marginSummary.accountValue);
  return {
    token: PERP_EQUITY_TOKEN,
    balance: accountEquityUsd.toString(),
    balanceFormatted: accountEquityUsd,
    priceUsd: 1,
    valueUsd: accountEquityUsd,
    change24hPct: null,
    category: 'perp-equity',
  };
}
