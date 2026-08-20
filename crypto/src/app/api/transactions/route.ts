import { NextResponse } from 'next/server';
import { fetchAllSources } from '@/lib/combine';
import { WALLET_KEYS } from '@/lib/wallets';
import type { ApiResult, SourcedTransaction, Transaction, TransactionType } from '@/lib/types';
import type { WalletKey } from '@/lib/wallets';

export const dynamic = 'force-dynamic';

const TX_TYPES: TransactionType[] = ['send', 'receive', 'swap', 'contract'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletParam = searchParams.get('wallet');
  const walletFilter = WALLET_KEYS.includes(walletParam as WalletKey) ? (walletParam as WalletKey) : null;

  const qs = new URLSearchParams();
  const token = searchParams.get('token');
  const type = searchParams.get('type');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  if (token) qs.set('token', token);
  if (type && TX_TYPES.includes(type as TransactionType)) qs.set('type', type);
  if (startDate) qs.set('startDate', startDate);
  if (endDate) qs.set('endDate', endDate);
  const path = `/api/transactions${qs.toString() ? `?${qs}` : ''}`;

  const results = await fetchAllSources<Transaction[]>(path);

  if (results.every((r) => r.data === null)) {
    const rateLimited = results.every((r) => r.rateLimited);
    return NextResponse.json(
      { error: results[0]?.error ?? 'Failed to load any wallet transactions', rateLimited } satisfies ApiResult<
        SourcedTransaction[]
      >,
      { status: rateLimited ? 429 : 502 },
    );
  }

  let merged: SourcedTransaction[] = results
    .flatMap((r) => (r.data ?? []).map((t) => ({ ...t, wallet: r.source.key })))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (walletFilter) merged = merged.filter((t) => t.wallet === walletFilter);

  return NextResponse.json({ data: merged } satisfies ApiResult<SourcedTransaction[]>);
}
