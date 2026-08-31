import { cached, cacheKey } from '../cache';
import { ADDRESSES, CACHE_TTL_SECONDS, COINGECKO_IDS } from '../config';
import * as coingecko from '../coingecko';
import type { Holding, Transaction } from '../types';
import { buildLotsAndDisposals } from './accountingFromTxs';
import * as he from './hiveEngineApi';
import type { PricedTransaction, SourceLedgerData } from './types';

/**
 * The TGLD source: the TGLD balance (liquid + staked) and transfer/market history of the Hive
 * account on Hive Engine.
 *
 * Pricing: TGLD isn't on CoinGecko. Its value is derived as (HIVE per TGLD) x (HIVE/USD from
 * CoinGecko). For cost basis / proceeds we prefer the HIVE actually moved on each Hive Engine
 * market fill (`quantityHive`), converted at that date's HIVE/USD - i.e. the real value of the
 * purchase, not zero. Plain transfers with no market price fall back to that date's TGLD spot
 * (current HIVE/TGLD ratio x historical HIVE/USD), which is approximate and flagged as such.
 */

const NETWORK = 'tgld' as const;
const ACCOUNT = ADDRESSES.hive;
const SYMBOL = 'TGLD';

const TGLD_TOKEN: Transaction['token'] = { symbol: SYMBOL, contractAddress: SYMBOL, isNative: false };

interface RawTgld {
  balance: he.HeBalance | null;
  metrics: he.HeMarketMetrics | null;
  history: he.HeHistoryRow[];
}

async function getRaw(): Promise<RawTgld> {
  return cached(cacheKey('rawwallet', ACCOUNT, NETWORK), CACHE_TTL_SECONDS.transactions, async () => {
    const [balance, metrics, history] = await Promise.all([
      he.getTokenBalance(ACCOUNT, SYMBOL),
      he.getMarketMetrics(SYMBOL),
      he.getAccountHistory(ACCOUNT, SYMBOL),
    ]);
    return { balance, metrics, history };
  });
}

interface TgldMove {
  hash: string;
  timestamp: string;
  /** signed TGLD amount */
  amount: number;
  from: string;
  to: string;
  /** HIVE paid/received per TGLD on this move, when it was a market fill; null for plain transfers */
  hivePerToken: number | null;
  label: string;
}

function toMoves(rows: he.HeHistoryRow[]): TgldMove[] {
  const moves: TgldMove[] = [];

  for (const r of rows) {
    if (r.symbol && r.symbol !== SYMBOL) continue;
    const timestamp = new Date(r.timestamp * 1000).toISOString();
    const hash = r.transactionId ?? `${r.operation}-${r.timestamp}`;
    const op = r.operation ?? '';

    if (op === 'tokens_transfer' || op === 'tokens_transferFrom' || op === 'tokens_issue') {
      const qty = Number(r.quantity ?? 0);
      if (!qty) continue;
      const isReceive = r.to === ACCOUNT;
      moves.push({
        hash,
        timestamp,
        amount: (isReceive ? 1 : -1) * qty,
        from: r.from ?? '',
        to: r.to ?? '',
        hivePerToken: null,
        label: op === 'tokens_issue' ? 'Issue' : 'Transfer',
      });
    } else if (op.startsWith('market_')) {
      const tokens = Number(r.quantityTokens ?? r.quantity ?? 0);
      if (!tokens) continue;
      const hive = Number(r.quantityHive ?? 0);
      const isBuy = op.includes('buy') || r.to === ACCOUNT;
      const perToken = hive > 0 ? hive / tokens : r.price ? Number(r.price) : null;
      moves.push({
        hash,
        timestamp,
        amount: (isBuy ? 1 : -1) * tokens,
        from: r.from ?? '',
        to: r.to ?? '',
        hivePerToken: perToken && Number.isFinite(perToken) ? perToken : null,
        label: isBuy ? 'Market buy' : 'Market sell',
      });
    }
    // tokens_stake / tokens_unstake / tokens_delegate etc. don't change economic ownership -> skipped
  }

  return moves;
}

function toTransactions(moves: TgldMove[]): Transaction[] {
  return moves
    .map((m) => ({
      hash: m.hash,
      network: NETWORK,
      timestamp: m.timestamp,
      type: (m.amount > 0 ? 'receive' : 'send') as Transaction['type'],
      token: TGLD_TOKEN,
      from: m.from,
      to: m.to,
      amount: m.amount,
      gasUsedNative: 0,
      gasUsedUsd: null,
      methodLabel: m.label,
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function hiveUsdOn(isoTimestamp: string): Promise<number | null> {
  const dateStr = new Date(isoTimestamp).toISOString().slice(0, 10);
  return cached(cacheKey('histprice', COINGECKO_IDS.hive, dateStr), CACHE_TTL_SECONDS.historicalPrice, () =>
    coingecko.getHistoricalPrice(COINGECKO_IDS.hive, new Date(isoTimestamp)),
  );
}

async function priceMoves(moves: TgldMove[], metrics: he.HeMarketMetrics | null): Promise<PricedTransaction[]> {
  const spotHivePerToken = metrics?.lastPrice ? Number(metrics.lastPrice) : null;
  const priced: PricedTransaction[] = [];

  for (const m of moves) {
    const base: Transaction = {
      hash: m.hash,
      network: NETWORK,
      timestamp: m.timestamp,
      type: m.amount > 0 ? 'receive' : 'send',
      token: TGLD_TOKEN,
      from: m.from,
      to: m.to,
      amount: m.amount,
      gasUsedNative: 0,
      gasUsedUsd: null,
      methodLabel: m.label,
    };

    const hiveUsd = await hiveUsdOn(m.timestamp);
    const hivePerToken = m.hivePerToken ?? spotHivePerToken;
    const priceUsd = hiveUsd !== null && hivePerToken !== null ? hivePerToken * hiveUsd : null;
    priced.push({ ...base, priceUsd });
  }

  return priced;
}

/** Used only by the generic gas-fee enricher, which never fires for TGLD (gas is always 0) - kept for interface parity */
export async function resolveHistoricalPrice(_token: Transaction['token'], isoTimestamp: string): Promise<number | null> {
  const [hiveUsd, metrics] = await Promise.all([
    hiveUsdOn(isoTimestamp),
    cached(cacheKey('metrics', SYMBOL), CACHE_TTL_SECONDS.currentPrice, () => he.getMarketMetrics(SYMBOL)),
  ]);
  const ratio = metrics?.lastPrice ? Number(metrics.lastPrice) : null;
  return hiveUsd !== null && ratio !== null ? ratio * hiveUsd : null;
}

async function getHoldings(raw: RawTgld): Promise<Holding[]> {
  const liquid = Number(raw.balance?.balance ?? 0);
  const staked = Number(raw.balance?.stake ?? 0);
  const pending = Number(raw.balance?.pendingUnstake ?? 0);
  const balance = liquid + staked + pending;

  const hivePerToken = raw.metrics?.lastPrice ? Number(raw.metrics.lastPrice) : null;
  const hivePrice = await cached(cacheKey('price', COINGECKO_IDS.hive), CACHE_TTL_SECONDS.currentPrice, () =>
    coingecko.getCurrentPrice(COINGECKO_IDS.hive),
  );
  const priceUsd = hivePerToken !== null ? hivePerToken * hivePrice.usd : null;

  return [
    {
      token: {
        contractAddress: SYMBOL,
        symbol: SYMBOL,
        name: 'The Gold Standard (Hive Engine)',
        decimals: 8,
        isNative: false,
        coingeckoId: null,
        network: NETWORK,
      },
      balance: String(balance),
      balanceFormatted: balance,
      priceUsd,
      valueUsd: priceUsd !== null ? balance * priceUsd : null,
      // 24h change would need HIVE's 24h change compounded with TGLD/HIVE's; not tracked
      change24hPct: null,
    },
  ];
}

export async function getNetworkLedgerData(): Promise<SourceLedgerData> {
  const raw = await getRaw();
  const moves = toMoves(raw.history);
  const transactions = toTransactions(moves);
  const holdings = await getHoldings(raw);
  const pricedTransactions = await priceMoves(moves, raw.metrics);
  const { lots, disposals } = buildLotsAndDisposals(pricedTransactions);

  return { holdings, transactions, lots, disposals, pricedTransactions };
}
