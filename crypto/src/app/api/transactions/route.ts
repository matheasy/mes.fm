import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/errors';
import { readStoredLedger } from '@/lib/store/read';
import { STORE_SOURCES } from '@/lib/store/storeSources';
import { WALLET_KEYS } from '@/lib/wallets';
import type { ApiResult, SourcedTransaction, TransactionType } from '@/lib/types';
import type { WalletKey } from '@/lib/wallets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TX_TYPES: TransactionType[] = ['send', 'receive', 'swap', 'contract'];
/** Rows sent to the page at most (newest first); the filters narrow it down */
const MAX_ROWS = 1000;

/**
 * GET /api/transactions - the combined history of the EVM wallets (Main, AI Trading, MikeFA), read from
 * the permanent store (lib/store) instead of asking every network's API on each visit. Tokens that never
 * had a market price (scam airdrops) are left out unless `includeSpam=1`.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const walletParam = searchParams.get('wallet');
    const walletFilter = WALLET_KEYS.includes(walletParam as WalletKey) ? (walletParam as WalletKey) : null;
    const token = searchParams.get('token')?.toUpperCase();
    const typeParam = searchParams.get('type');
    const type = TX_TYPES.includes(typeParam as TransactionType) ? (typeParam as TransactionType) : null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const includeSpam = searchParams.get('includeSpam') === '1';

    const ids = STORE_SOURCES.filter((s) => s.id.startsWith('evm:') && (!walletFilter || s.id.startsWith(`evm:${walletFilter}:`))).map((s) => s.id);
    const { tx } = await readStoredLedger(ids);

    let rows = tx;
    if (!includeSpam) rows = rows.filter((t) => !t.spam);
    if (token) rows = rows.filter((t) => t.token.symbol.toUpperCase() === token);
    if (type) rows = rows.filter((t) => t.type === type);
    if (startDate) rows = rows.filter((t) => t.timestamp >= startDate);
    if (endDate) rows = rows.filter((t) => t.timestamp <= `${endDate.slice(0, 10)}T23:59:59.999Z`);
    rows = rows.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, MAX_ROWS);

    const data: SourcedTransaction[] = rows.map((t) => ({
      hash: t.hash,
      network: t.network,
      timestamp: t.timestamp,
      type: t.type,
      token: t.token,
      from: t.from,
      to: t.to,
      amount: t.amount,
      // the table's gas column is in BNB; other networks show their gas in USD only
      gasUsedBnb: t.network === 'bsc' ? t.gasNative : 0,
      gasUsedUsd: t.gasUsedUsd,
      methodLabel: t.methodLabel,
      wallet: t.wallet,
    }));
    return NextResponse.json({ data } satisfies ApiResult<SourcedTransaction[]>);
  } catch (err) {
    return apiErrorResponse(err, 'Failed to load the stored transactions');
  }
}
