import { NextResponse } from 'next/server';
import { NATIVE_TOKENS, NETWORKS, type NetworkId } from '@/lib/config';
import { apiErrorResponse } from '@/lib/errors';
import { getHistoricalPriceForToken, getTransactions } from '@/lib/ledger';
import type { ApiResult, Transaction, TransactionType } from '@/lib/types';

export const dynamic = 'force-dynamic';

const TX_TYPES: TransactionType[] = ['send', 'receive', 'swap', 'contract'];

function parseNetwork(searchParams: URLSearchParams): NetworkId | undefined {
  const param = searchParams.get('network');
  return NETWORKS.includes(param as NetworkId) ? (param as NetworkId) : undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenFilter = searchParams.get('token')?.toUpperCase();
    const typeParam = searchParams.get('type');
    const typeFilter = TX_TYPES.includes(typeParam as TransactionType) ? (typeParam as TransactionType) : null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const network = parseNetwork(searchParams);

    const { transactions: allTransactions, networkErrors } = await getTransactions(network);
    let transactions = allTransactions;

    if (tokenFilter) transactions = transactions.filter((t) => t.token.symbol.toUpperCase() === tokenFilter);
    if (typeFilter) transactions = transactions.filter((t) => t.type === typeFilter);
    if (startDate) transactions = transactions.filter((t) => t.timestamp >= startDate);
    if (endDate) transactions = transactions.filter((t) => t.timestamp <= endDate);

    // enrich gas-fee USD lazily, only for the page being returned, to limit CoinGecko calls
    const page = transactions.slice(0, 200);
    const enriched: Transaction[] = await Promise.all(
      page.map(async (t) => {
        if (t.gasUsedNative === 0) return t;
        const nativeToken = NATIVE_TOKENS[t.network];
        const nativePrice = await getHistoricalPriceForToken(
          { symbol: nativeToken.symbol, contractAddress: nativeToken.contractAddress, isNative: true },
          t.timestamp,
          t.network,
        );
        return { ...t, gasUsedUsd: nativePrice !== null ? t.gasUsedNative * nativePrice : null };
      }),
    );

    return NextResponse.json({ data: enriched, networkErrors } satisfies ApiResult<Transaction[]>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load transactions');
  }
}
