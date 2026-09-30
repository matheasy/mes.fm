import { cached, cacheKey } from '../../cache';
import type { TaxEntry } from '../acb';
import { HIVE_ACCOUNTS } from '../accounts';
import { getDailySeries, priceOn, type DailySeries } from '../dailyPrices';
import { isOwnAddress } from '../ownAddresses';

const HISTORY = 'https://history.hive-engine.com';
/** Public Hive Engine nodes, tried in turn - each throttles bursts with 503s */
const RPCS = [
  'https://api.hive-engine.com/rpc/blockchain',
  'https://api2.hive-engine.com/rpc/blockchain',
  'https://herpc.dtools.dev/blockchain',
  'https://herpc.actifit.io/blockchain',
  'https://api.primersion.com/blockchain',
];

/**
 * The Hive Engine tokens that are money for the owner: the pegged coins (SWAP.HIVE is HIVE, SWAP.BTC
 * is BTC... - same ACB pools, see assetKey) and the tokens they actually trade. TGLD has its own
 * source (tgld.ts); it's listed here only so pool swaps into/out of TGLD are found. The hundreds of
 * social-reward tokens (PAY, VOTE, CURE...) are left out - dust nobody sells.
 */
const SYMBOLS = ['SWAP.HIVE', 'SWAP.HBD', 'SWAP.BTC', 'SWAP.ETH', 'SWAP.USDT', 'LEO', 'SURGE', 'LSTR', 'ACE', 'TGLD'];
const OWN_SOURCE_SYMBOLS = new Set(['TGLD']);

/** Gateways moving a coin between Hive Engine and its own chain: withdrawing/depositing is the owner's
 * own move, paired with the other chain's leg in lib/tax/report.ts (see TaxEntry.peg) */
const GATEWAYS: Record<string, NonNullable<TaxEntry['peg']>> = {
  'honey-swap': 'hive',
  'btc-swap': 'bitcoin',
  'swap-eth': 'ethereum',
};
/** Operations that move nothing the owner owns (orders placed/cancelled, staking, locked balances returned) */
const SKIPPED_OPERATIONS = new Set([
  'market_placeOrder',
  'market_cancel',
  'market_closeOrder',
  'market_expire',
  'market_buyRemaining',
  'market_sellRemaining',
  'tokens_stake',
  'tokens_unstakeStart',
  'tokens_unstakeDone',
  'tokens_cancelUnstake',
  'tokens_delegate',
  'tokens_undelegateStart',
  'tokens_undelegateDone',
]);
/** Swap services answering a transfer with another token (SwapRequest -> SwapResponse) */
const SWAP_SERVICES = new Set(['dswap']);
/** Accounts whose transfers are staking/curation/yield payouts - income */
const REWARD_ACCOUNTS = new Set(['leo.tokens', 'leo.bounties', 'surge.yield', 'lstr.voter', 'ace.yield', 'bbhbot', 'contract_distribution', 'contract_tokens']);

/** Daily USD price per pegged symbol (CoinGecko id), else priced from the trade itself */
const PEGGED: Record<string, string> = {
  'SWAP.HIVE': 'hive',
  'SWAP.HBD': 'hive_dollar',
  'SWAP.BTC': 'bitcoin',
  'SWAP.ETH': 'ethereum',
};

interface HeRow {
  _id: string;
  timestamp: number;
  operation: string;
  from?: string;
  to?: string;
  symbol?: string;
  quantity?: string;
  quantityTokens?: string;
  quantityHive?: string;
  transactionId?: string;
  memo?: string | null;
  account: string;
}

interface TxEvent {
  contract: string;
  event: string;
  data: { from?: string; to?: string; symbol?: string; quantity?: string };
}

/** GET with retries: the history server answers 503/429 when asked too much too fast */
export async function getJson<T>(url: string): Promise<T> {
  let status = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1500 * attempt));
    let res: Response;
    try {
      res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    } catch {
      status = 0; // timed out / connection dropped: retry
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    status = res.status;
    if (status !== 429 && status < 500) break;
  }
  throw new Error(status ? `Hive Engine history answered ${status}` : 'Hive Engine history timed out');
}

async function accountHistory(account: string, symbol: string): Promise<HeRow[]> {
  const out: HeRow[] = [];
  for (let offset = 0; offset < 200_000; offset += 500) {
    const rows = await getJson<Omit<HeRow, 'account'>[]>(`${HISTORY}/accountHistory?account=${account}&symbol=${symbol}&limit=500&offset=${offset}`);
    out.push(...rows.map((r) => ({ ...r, account })));
    if (rows.length < 500) return out;
  }
  throw new Error(`${symbol} history for @${account} longer than expected`);
}

/** The token transfers of one sidechain transaction (a pool swap's two sides are only in its logs) */
async function txEvents(txid: string): Promise<TxEvent[]> {
  return cached(
    cacheKey('he-tx-v1', txid),
    async () => {
      // any node that has it: a node answering "not found" may just be behind, and each throttles bursts
      let problem = 'no node answered';
      for (let attempt = 0; attempt < 2 * RPCS.length; attempt++) {
        if (attempt >= RPCS.length) await new Promise((r) => setTimeout(r, 1500));
        try {
          const res = await fetch(RPCS[attempt % RPCS.length]!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransactionInfo', params: { txid } }),
            cache: 'no-store',
            signal: AbortSignal.timeout(30_000),
          });
          if (!res.ok) {
            problem = `Hive Engine RPC answered ${res.status}`;
            continue;
          }
          const json = (await res.json()) as { result?: { logs?: string } | null };
          if (!json.result) {
            problem = `Hive Engine transaction ${txid} not found`;
            continue;
          }
          const logs = JSON.parse(json.result.logs ?? '{}') as { events?: TxEvent[] };
          return (logs.events ?? []).filter((e) => e.contract === 'tokens' && (e.event === 'transferToContract' || e.event === 'transferFromContract'));
        } catch (err) {
          problem = err instanceof Error ? err.message : 'Hive Engine RPC failed';
        }
      }
      throw new Error(problem);
    },
    // a transaction never changes once it's in a block
  );
}

/**
 * Hive Engine for every Hive account, as tax legs: pool swaps (both sides, from the transaction's
 * logs), order-book fills (the token against the SWAP.HIVE paid/received), dswap swap requests and
 * responses (market trades), peg deposits/withdrawals (the owner's own moves, marked `peg` for
 * pairing), rewards (income) and ordinary transfers. Staking, order placing/cancelling and locked
 * balances don't change what's owned and are skipped.
 */
export async function getHiveEngineEntries(): Promise<TaxEntry[]> {
  const rows = await cached(
    cacheKey('he-money-history-v4'),
    async () => {
      // one at a time - the history server throttles bursts
      const all: HeRow[] = [];
      for (const a of HIVE_ACCOUNTS) for (const s of SYMBOLS) all.push(...(await accountHistory(a, s)));
      // kept small for the cache: only rows that move tokens, memos only where they name a destination
      return all
        .filter((r) => !SKIPPED_OPERATIONS.has(r.operation))
        .map((r) => (r.memo && GATEWAYS[r.to ?? ''] ? r : { ...r, memo: undefined }));
    },
    30 * 60,
  );
  if (rows.length === 0) return [];

  const first = new Date(Math.min(...rows.map((r) => r.timestamp)) * 1000).toISOString();
  const series = new Map<string, DailySeries>();
  await Promise.all(
    [...new Set(Object.values(PEGGED))].map(async (id) => series.set(id, await getDailySeries(id, first))),
  );
  const pegPrice = (symbol: string, iso: string): number | null => {
    if (symbol === 'SWAP.USDT') return 1;
    const id = PEGGED[symbol];
    return id ? priceOn(series.get(id)!, iso) : null;
  };

  // trades: every leg of a transaction priced by the legs whose price is known
  const trades = new Map<string, TaxEntry[]>();
  const addTradeLeg = (e: TaxEntry) => {
    const list = trades.get(e.hash) ?? [];
    list.push(e);
    trades.set(e.hash, list);
  };
  const entries: TaxEntry[] = [];
  const seen = new Set<string>();
  const poolTxs = new Map<string, HeRow>();

  for (const r of rows) {
    if (seen.has(`${r.account}:${r._id}`)) continue;
    seen.add(`${r.account}:${r._id}`);
    const account = r.account;
    const symbol = r.symbol ?? '';
    const timestamp = new Date(r.timestamp * 1000).toISOString();
    const hash = r.transactionId ?? `${r.operation}-${r._id}`;
    const base = { source: `hive:${account}`, hash, network: 'hive-engine', timestamp };

    if (r.operation.startsWith('marketpools_')) {
      if (r.transactionId) poolTxs.set(`${account}:${r.transactionId}`, r);
      continue;
    }
    if (OWN_SOURCE_SYMBOLS.has(symbol)) continue; // TGLD's own transfers and fills: tgld.ts

    if (r.operation === 'market_buy' || r.operation === 'market_sell') {
      const tokens = Number(r.quantityTokens ?? 0);
      const hive = Number(r.quantityHive ?? 0);
      if (!tokens || !hive) continue;
      const buy = r.operation === 'market_buy';
      const counterparty = (buy ? r.from : r.to) ?? 'hive-engine-market';
      addTradeLeg({ ...base, symbol, amount: buy ? tokens : -tokens, priceUsd: null, from: buy ? counterparty : account, to: buy ? account : counterparty, market: true });
      addTradeLeg({ ...base, symbol: 'SWAP.HIVE', amount: buy ? -hive : hive, priceUsd: null, from: buy ? account : counterparty, to: buy ? counterparty : account, market: true });
      continue;
    }

    const qty = Number(r.quantity ?? 0);
    if (!qty) continue;

    if (r.operation === 'hivepegged_buy' || r.operation === 'hivepegged_withdraw') {
      const incoming = r.operation === 'hivepegged_buy';
      entries.push({
        ...base,
        symbol,
        amount: incoming ? qty : -qty,
        priceUsd: pegPrice(symbol, timestamp),
        from: incoming ? 'honey-swap' : account,
        to: incoming ? account : 'honey-swap',
        bridge: true,
        peg: 'hive',
      });
      continue;
    }

    if (r.operation === 'tokens_transfer' || r.operation === 'tokens_transferFrom' || r.operation === 'tokens_issue' || r.operation === 'distribution_checkPendingDistributions') {
      const from = r.operation === 'tokens_issue' ? ((r as { issuer?: string }).issuer ?? 'contract_tokens') : (r.from ?? 'hive-engine');
      const to = r.to ?? account;
      if (from === to) continue;
      const incoming = to === account;
      const counterparty = incoming ? from : to;
      const leg: TaxEntry = { ...base, symbol, amount: incoming ? qty : -qty, priceUsd: pegPrice(symbol, timestamp), from, to };
      const gateway = GATEWAYS[counterparty];
      // withdrawing to another chain names the destination in the memo ("BTC bc1q..."): an own move only
      // when that's the owner's own address, else it's paying someone. Deposits come from the owner.
      const destination = r.memo?.trim().split(/\s+/).pop() ?? '';
      if (gateway && (incoming || isOwnAddress(destination))) {
        entries.push({ ...leg, bridge: true, peg: gateway });
      } else if (SWAP_SERVICES.has(counterparty)) {
        addTradeLeg({ ...leg, market: true });
      } else if (incoming && (REWARD_ACCOUNTS.has(counterparty) || r.operation !== 'tokens_transfer')) {
        addTradeLeg({ ...leg, income: 'Hive Engine rewards' });
      } else {
        addTradeLeg(leg);
      }
    }
    // tokens_stake/unstake/delegate, market_placeOrder/cancel/expire, *Remaining: nothing changes hands
  }

  // pool swaps and liquidity: both sides from the transaction's logs
  const poolList = [...poolTxs.values()];
  for (let i = 0; i < poolList.length; i += 3) {
    await Promise.all(
      poolList.slice(i, i + 3).map(async (r) => {
        const events = await txEvents(r.transactionId!);
        const timestamp = new Date(r.timestamp * 1000).toISOString();
        const base = { source: `hive:${r.account}`, hash: r.transactionId!, network: 'hive-engine', timestamp };
        for (const ev of events) {
          const qty = Number(ev.data.quantity ?? 0);
          const symbol = ev.data.symbol ?? '';
          if (!qty || !symbol) continue;
          if (ev.event === 'transferToContract' && ev.data.from === r.account) {
            addTradeLeg({ ...base, symbol, amount: -qty, priceUsd: null, from: r.account, to: 'hive-engine-pool', market: true });
          } else if (ev.event === 'transferFromContract' && ev.data.to === r.account) {
            addTradeLeg({ ...base, symbol, amount: qty, priceUsd: null, from: 'hive-engine-pool', to: r.account, market: true });
          }
        }
      }),
    );
  }

  // price every trade: legs of known price as they are, the rest from the other side's value (a swap is
  // worth the same on both sides); a lone leg of an unpriced token stays unpriced (skipped by the calculation)
  for (const legs of trades.values()) {
    for (const l of legs) if (l.priceUsd === null) l.priceUsd = pegPrice(l.symbol, l.timestamp);
    const valueOf = (side: TaxEntry[]) => side.reduce((s, l) => s + Math.abs(l.amount) * (l.priceUsd ?? 0), 0);
    const ins = legs.filter((l) => l.amount > 0 && !l.income);
    const outs = legs.filter((l) => l.amount < 0);
    for (const [side, other] of [
      [ins, outs],
      [outs, ins],
    ] as const) {
      const unknown = side.filter((l) => l.priceUsd === null);
      if (!unknown.length || other.some((l) => l.priceUsd === null) || !other.length) continue;
      const value = valueOf(other) - valueOf(side);
      const units = unknown.reduce((s, l) => s + Math.abs(l.amount), 0);
      if (value > 0 && units > 0) for (const l of unknown) l.priceUsd = value / units;
    }
    entries.push(...legs);
  }

  // what's still unpriced (a reward in a token with no trade that day): the token's own traded price
  const unpriced = entries.filter((e) => e.priceUsd === null);
  if (unpriced.length) {
    const hive = series.get('hive')!;
    const bySymbol = new Map<string, (iso: string) => number | null>();
    for (const s of new Set(unpriced.map((e) => e.symbol))) bySymbol.set(s, await hivePerToken(s));
    for (const e of unpriced) {
      const perToken = bySymbol.get(e.symbol)?.(e.timestamp) ?? null;
      const hiveUsd = priceOn(hive, e.timestamp);
      e.priceUsd = perToken !== null && hiveUsd !== null ? perToken * hiveUsd : null;
    }
  }
  return entries;
}

/** HIVE per token by day: the day's volume-weighted Hive Engine price (days above 5 HIVE traded), carried forward */
export async function hivePerToken(symbol: string): Promise<(iso: string) => number | null> {
  const days = await cached(
    cacheKey('he-market-history-v1', symbol),
    () => getJson<{ timestamp: number; volumeHive: string; volumeToken: string }[]>(`${HISTORY}/marketHistory?symbol=${symbol}`),
    6 * 3600,
  );
  const points = days
    .filter((d) => Number(d.volumeHive) >= 5 && Number(d.volumeToken) > 0)
    .map((d) => [d.timestamp * 1000, Number(d.volumeHive) / Number(d.volumeToken)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  return (iso) => {
    const t = Date.parse(iso);
    let price: number | null = null;
    for (const [ts, p] of points) {
      if (ts > t + 86_400_000) break;
      price = p;
    }
    return price;
  };
}

/**
 * SWAP.HIVE the calculation counts on Hive Engine but the account no longer holds, per account: HIVE
 * spent there in a way not tracked (a trade in a token not in SYMBOLS, liquidity added to a pool...).
 * Those units stay in the HIVE pool, slightly lowering its average cost. Empty when it all adds up.
 */
export async function swapHiveGaps(entries: TaxEntry[]): Promise<{ account: string; missing: number }[]> {
  const tracked = new Map<string, number>();
  for (const e of entries)
    if (e.network === 'hive-engine' && e.symbol === 'SWAP.HIVE') tracked.set(e.source, (tracked.get(e.source) ?? 0) + e.amount);
  const res = await fetch('https://api.hive-engine.com/rpc/contracts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'find',
      params: { contract: 'tokens', table: 'balances', query: { account: { $in: [...HIVE_ACCOUNTS] }, symbol: 'SWAP.HIVE' } },
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Hive Engine answered ${res.status}`);
  const held = new Map<string, number>();
  for (const b of ((await res.json()) as { result?: { account: string; balance: string }[] }).result ?? []) held.set(b.account, Number(b.balance));
  return HIVE_ACCOUNTS.map((account) => ({ account, missing: (tracked.get(`hive:${account}`) ?? 0) - (held.get(account) ?? 0) })).filter(
    (g) => g.missing > 1,
  );
}
