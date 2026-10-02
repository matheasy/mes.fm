import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/apps/mfa/lib/errors';
import { getHistoricalPriceForToken, getPricedTransactions } from '@/apps/mfa/lib/ledger';
import type { ApiResult, Transaction, TransactionType } from '@/apps/mfa/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TX_TYPES: TransactionType[] = ['send', 'receive', 'swap', 'contract'];

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenFilter = searchParams.get('token')?.toUpperCase();
    const typeParam = searchParams.get('type');
    const typeFilter = TX_TYPES.includes(typeParam as TransactionType) ? (typeParam as TransactionType) : null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // tokens that never had a market price (scam airdrops) are left out unless asked for - the same
    // rule as the AI/Main wallet's route; prices are cached, so this costs no extra lookups after the first
    const priced = await getPricedTransactions();
    const pricedTokens = new Set(priced.filter((t) => t.priceUsd !== null).map((t) => t.token.contractAddress.toLowerCase()));
    let transactions: Transaction[] = priced.map(({ priceUsd: _price, ...t }) => t);
    if (searchParams.get('includeSpam') !== '1')
      transactions = transactions.filter((t) => t.token.isNative || t.amount === 0 || pricedTokens.has(t.token.contractAddress.toLowerCase()));

    if (tokenFilter) transactions = transactions.filter((t) => t.token.symbol.toUpperCase() === tokenFilter);
    if (typeFilter) transactions = transactions.filter((t) => t.type === typeFilter);
    if (startDate) transactions = transactions.filter((t) => t.timestamp >= startDate);
    if (endDate) transactions = transactions.filter((t) => t.timestamp <= endDate);

    // enrich gas-fee USD lazily, only for the page being returned, to limit CoinGecko calls
    const page = transactions.slice(0, 200);
    const enriched: Transaction[] = await Promise.all(
      page.map(async (t) => {
        if (t.gasUsedBnb === 0) return t;
        const bnbPrice = await getHistoricalPriceForToken({ symbol: 'BNB', contractAddress: 'BNB', isNative: true }, t.timestamp);
        return { ...t, gasUsedUsd: bnbPrice !== null ? t.gasUsedBnb * bnbPrice : null };
      }),
    );

    return NextResponse.json({ data: enriched } satisfies ApiResult<Transaction[]>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load transactions');
  }
}
