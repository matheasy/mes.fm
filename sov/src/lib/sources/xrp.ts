import { cached, cacheKey } from '../cache';
import { ADDRESSES, CACHE_TTL_SECONDS, COINGECKO_IDS } from '../config';
import * as coingecko from '../coingecko';
import type { Holding, Transaction } from '../types';
import { buildLotsAndDisposals, priceTransactions } from './accountingFromTxs';
import * as xrpl from './xrplApi';
import type { SourceLedgerData } from './types';

/**
 * The XRP source: the native XRP balance and Payment history of one XRP Ledger address. Only
 * Payment transactions delivering XRP (not issued currencies) are ingested - DEX offers, trust
 * lines, AMM ops etc. are out of scope for a store-of-value view. Priced off CoinGecko `ripple`.
 */

const NETWORK = 'xrp' as const;
const ADDRESS = ADDRESSES.xrp.toLowerCase();
const DROPS_PER_XRP = 1_000_000;

const XRP_TOKEN: Transaction['token'] = { symbol: 'XRP', contractAddress: 'XRP', isNative: true };

interface RawXrp {
  balanceDrops: string;
  txs: xrpl.NormalizedXrplTx[];
}

async function getRaw(): Promise<RawXrp> {
  return cached(cacheKey('rawwallet', ADDRESS, NETWORK), CACHE_TTL_SECONDS.transactions, async () => {
    const [balanceDrops, txs] = await Promise.all([
      xrpl.getAccountBalanceDrops(ADDRESSES.xrp),
      xrpl.getAccountTx(ADDRESSES.xrp),
    ]);
    return { balanceDrops, txs };
  });
}

function normalize(txs: xrpl.NormalizedXrplTx[]): Transaction[] {
  const out: Transaction[] = [];

  for (const t of txs) {
    if (!t.succeeded || !t.isoTimestamp) continue;
    if (t.type !== 'Payment') continue;
    if (typeof t.delivered !== 'string') continue; // issued-currency payment, not XRP

    const drops = Number(t.delivered);
    if (!Number.isFinite(drops) || drops === 0) continue;

    const isReceive =
      t.destination.toLowerCase() === ADDRESS
        ? true
        : t.account.toLowerCase() === ADDRESS
          ? false
          : null;
    if (isReceive === null) continue;

    const amount = (isReceive ? 1 : -1) * (drops / DROPS_PER_XRP);
    const feeXrp = !isReceive && t.feeDrops ? Number(t.feeDrops) / DROPS_PER_XRP : 0;

    out.push({
      hash: t.hash,
      network: NETWORK,
      timestamp: t.isoTimestamp,
      type: amount > 0 ? 'receive' : 'send',
      token: XRP_TOKEN,
      from: t.account,
      to: t.destination,
      amount,
      gasUsedNative: feeXrp,
      gasUsedUsd: null,
      methodLabel: null,
    });
  }

  return out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function resolveHistoricalPrice(_token: Transaction['token'], isoTimestamp: string): Promise<number | null> {
  const dateStr = new Date(isoTimestamp).toISOString().slice(0, 10);
  return cached(cacheKey('histprice', COINGECKO_IDS.xrp, dateStr), CACHE_TTL_SECONDS.historicalPrice, () =>
    coingecko.getHistoricalPrice(COINGECKO_IDS.xrp, new Date(isoTimestamp)),
  );
}

async function getHoldings(raw: RawXrp): Promise<Holding[]> {
  const balance = Number(raw.balanceDrops) / DROPS_PER_XRP;
  const price = await cached(cacheKey('price', COINGECKO_IDS.xrp), CACHE_TTL_SECONDS.currentPrice, () =>
    coingecko.getCurrentPrice(COINGECKO_IDS.xrp),
  );

  return [
    {
      token: {
        contractAddress: 'XRP',
        symbol: 'XRP',
        name: 'XRP',
        decimals: 6,
        isNative: true,
        coingeckoId: COINGECKO_IDS.xrp,
        network: NETWORK,
      },
      balance: raw.balanceDrops,
      balanceFormatted: balance,
      priceUsd: price.usd,
      valueUsd: balance * price.usd,
      change24hPct: price.usd24hChange,
    },
  ];
}

export async function getNetworkLedgerData(): Promise<SourceLedgerData> {
  const raw = await getRaw();
  const transactions = normalize(raw.txs);
  const holdings = await getHoldings(raw);
  const pricedTransactions = await priceTransactions(transactions, resolveHistoricalPrice);
  const { lots, disposals } = buildLotsAndDisposals(pricedTransactions);

  return { holdings, transactions, lots, disposals, pricedTransactions };
}
