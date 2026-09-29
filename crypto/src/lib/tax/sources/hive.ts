import { cached, cacheKey } from '../../cache';
import type { TaxEntry } from '../acb';
import { HIVE_ACCOUNTS } from '../accounts';
import { getDailySeries, priceOn } from '../dailyPrices';
import { isOwnAddress } from '../ownAddresses';


/** Hive launched as a fork of Steem at this moment; everything earlier was STEEM/SBD, a different coin
 * that stayed on the Steem chain. What each account held at the fork arrived as an airdrop: with no
 * history before it, those units simply have no acquisition here, so they count at a cost of $0. */
export const HIVE_FORK = '2020-03-20T14:00:00';

const NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network'];

/**
 * Only operations that move money (HIVE / HBD) are requested - votes, posts, comments, follows and
 * the rest of Hive's social activity are never fetched. Operation ids, as in hived's protocol
 * (checked live: each returned only its own type):
 *   2 transfer · 39 claim_reward_balance · 50 fill_convert_request (HBD -> HIVE) · 55 interest (HBD
 *   savings) · 56 fill_vesting_withdraw (power down) · 57 fill_order (internal market)
 *   64 producer_reward · 66 proposal_pay · 77 transfer_to_vesting_completed (power up)
 *   81 fill_collateralized_convert_request (HIVE -> HBD) · 83 fill_recurrent_transfer
 * Rewards count when they're claimed (one entry per claim) rather than at each curation/author
 * payout. Power ups/downs move the owner's own HIVE between liquid and staked, so they're not money
 * leaving - they're only read for the VESTS->HIVE rate at that moment (see vestsRate below).
 */
const FILTER_LOW = [2, 39, 50, 55, 56, 57].reduce((m, i) => m | (1n << BigInt(i)), 0n).toString();
const FILTER_HIGH = [64, 66, 77, 81, 83].reduce((m, i) => m | (1n << BigInt(i - 64)), 0n).toString();

/** Accounts on the other end of a move between the owner's own holdings that aren't tracked yet: Hive
 * Engine's HIVE peg (HIVE sent here becomes SWAP.HIVE on Hive Engine) and Magi's gateway (HBD sent here
 * is the owner's HBD on Magi - mes.fm/assets lists it) */
const BRIDGES = new Set(['honey-swap', 'vsc.gateway']);

type Asset = { amount: string; precision: number; nai: string };
type HistoryItem = [number, { trx_id: string; op_in_trx: number; block: number; timestamp: string; op: { type: string; value: Record<string, unknown> } }];

async function rpc<T>(method: string, params: unknown): Promise<T> {
  let lastError: unknown;
  for (const node of NODES) {
    try {
      const res = await fetch(node, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`${node} answered ${res.status}`);
      const json = (await res.json()) as { result?: T; error?: { message: string } };
      if (json.error) throw new Error(`${node}: ${json.error.message}`);
      return json.result as T;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('No Hive API node answered');
}

/** The account's money operations since the fork, newest page first, 1,000 matching operations per call */
async function getMoneyHistory(account: string): Promise<HistoryItem[]> {
  const out: HistoryItem[] = [];
  let start = -1;
  for (let page = 0; page < 200; page++) {
    const limit = start < 0 ? 1000 : Math.min(1000, start + 1);
    const { history } = await rpc<{ history: HistoryItem[] }>('account_history_api.get_account_history', {
      account,
      start,
      limit,
      include_reversible: true,
      operation_filter_low: FILTER_LOW,
      operation_filter_high: FILTER_HIGH,
    });
    if (!history.length) return out;
    out.push(...history.filter(([, h]) => h.timestamp >= HIVE_FORK));
    const oldest = history[0]!;
    start = oldest[0] - 1;
    if (start < 0 || oldest[1].timestamp < HIVE_FORK) return out;
  }
  throw new Error(`Hive history for @${account} is longer than expected`);
}

const NAI_HIVE = '@@000000021';
const NAI_HBD = '@@000000013';
const NAI_VESTS = '@@000000037';

function units(a: unknown): number {
  const x = a as Asset | undefined;
  return x ? Number(x.amount) / 10 ** x.precision : 0;
}
function symbolOf(a: unknown): 'HIVE' | 'HBD' | 'VESTS' | null {
  const nai = (a as Asset | undefined)?.nai;
  return nai === NAI_HIVE ? 'HIVE' : nai === NAI_HBD ? 'HBD' : nai === NAI_VESTS ? 'VESTS' : null;
}

/**
 * HIVE per VEST over time. Hive Power is HIVE staked; a reward paid "in HP" is paid in VESTS, whose
 * HIVE value creeps up over time (482.6 HIVE per million VESTS in mid-2017, ~621.7 in Sept 2026).
 * The exact rate at a moment is known from any power up or power down (HIVE in / VESTS out), and the
 * owner's four accounts have hundreds of those; between samples the rate is interpolated, and today's
 * rate comes from the chain's global properties.
 */
function vestsRate(samples: [number, number][]): (unixMs: number) => number {
  const s = [...samples].sort((a, b) => a[0] - b[0]);
  return (t) => {
    if (!s.length) return 0;
    if (t <= s[0]![0]) return s[0]![1];
    for (let i = 1; i < s.length; i++) {
      const [t1, r1] = s[i]!;
      if (t <= t1) {
        const [t0, r0] = s[i - 1]!;
        return r0 + ((r1 - r0) * (t - t0)) / (t1 - t0 || 1);
      }
    }
    return s[s.length - 1]![1];
  };
}

/** Compact, memo-free form of one money leg - what gets cached per account */
interface HiveLeg {
  account: string;
  hash: string;
  timestamp: string;
  symbol: 'HIVE' | 'HBD';
  /** Liquid amount (signed) */
  amount: number;
  /** Hive Power part of a reward, in VESTS - converted to HIVE once every account's rate samples are known */
  vests?: number;
  from: string;
  to: string;
  income?: string;
}

/** Turns one account's money operations into signed HIVE/HBD legs (reward VESTS kept aside, see HiveLeg.vests) */
function toLegs(account: string, items: HistoryItem[]): HiveLeg[] {
  const legs: HiveLeg[] = [];
  for (const [index, h] of items) {
    const v = h.op.value;
    const ts = `${h.timestamp}Z`;
    const hash = /^0+$/.test(h.trx_id) ? `hive-${h.block}-${index}` : `${h.trx_id}:${h.op_in_trx}`;
    const leg = (symbol: 'HIVE' | 'HBD', amount: number, from: string, to: string, income?: string, vests = 0) => {
      if (amount !== 0 || vests !== 0) legs.push({ account, hash, timestamp: ts, symbol, amount, from, to, income, ...(vests ? { vests } : {}) });
    };
    const liquid = (a: unknown) => {
      const s = symbolOf(a);
      return s === 'HIVE' || s === 'HBD' ? s : null;
    };

    switch (h.op.type) {
      case 'transfer_operation':
      case 'fill_recurrent_transfer_operation': {
        const s = liquid(v.amount);
        if (!s) break;
        if (v.from === account && v.to === account) break;
        if (v.from === account) leg(s, -units(v.amount), account, String(v.to));
        else leg(s, units(v.amount), String(v.from), account);
        break;
      }
      case 'claim_reward_balance_operation': {
        leg('HIVE', units(v.reward_hive), 'hive-rewards', account, 'Hive rewards (claimed)', units(v.reward_vests));
        leg('HBD', units(v.reward_hbd), 'hive-rewards', account, 'Hive rewards (claimed)');
        break;
      }
      case 'interest_operation':
        leg('HBD', units(v.interest), 'hbd-savings', account, 'HBD savings interest');
        break;
      case 'producer_reward_operation':
        leg('HIVE', 0, 'hive-witness', account, 'Witness rewards', units(v.vesting_shares));
        break;
      case 'proposal_pay_operation': {
        const s = liquid(v.payment);
        if (s) leg(s, units(v.payment), 'hive-dhf', account, 'DHF proposal pay');
        break;
      }
      case 'fill_convert_request_operation': // HBD -> HIVE, 3.5 days after the request
        leg('HBD', -units(v.amount_in), account, 'hive-conversion');
        leg('HIVE', units(v.amount_out), 'hive-conversion', account);
        break;
      case 'fill_collateralized_convert_request_operation': // HIVE -> HBD
        leg('HIVE', -units(v.amount_in), account, 'hive-conversion');
        leg('HBD', units(v.amount_out), 'hive-conversion', account);
        break;
      case 'fill_order_operation': {
        // the internal market: whichever side this account was on, it paid one coin and received the other
        const mine = v.current_owner === account ? ['current_pays', 'open_pays'] : v.open_owner === account ? ['open_pays', 'current_pays'] : null;
        if (!mine || v.current_owner === v.open_owner) break;
        const paid = liquid(v[mine[0]!]);
        const got = liquid(v[mine[1]!]);
        if (paid) leg(paid, -units(v[mine[0]!]), account, 'hive-market');
        if (got) leg(got, units(v[mine[1]!]), 'hive-market', account);
        break;
      }
      case 'fill_vesting_withdraw_operation': {
        // a power down paid to someone else, or someone else's routed to this account, is HIVE changing hands
        if (v.from_account === v.to_account || symbolOf(v.deposited) !== 'HIVE') break;
        if (v.from_account === account) leg('HIVE', -units(v.deposited), account, String(v.to_account));
        else leg('HIVE', units(v.deposited), String(v.from_account), account);
        break;
      }
      case 'transfer_to_vesting_completed_operation': {
        // powering up another account is HIVE leaving; being powered up by someone else is HIVE arriving
        if (v.from_account === v.to_account) break;
        if (v.from_account === account) leg('HIVE', -units(v.hive_vested), account, String(v.to_account));
        else leg('HIVE', units(v.hive_vested), String(v.from_account), account);
        break;
      }
    }
  }
  return legs;
}

/** Every exact VESTS rate sample in the history: power ups (HIVE in -> VESTS out) and power downs (VESTS -> HIVE) */
function rateSamples(items: HistoryItem[]): [number, number][] {
  const out: [number, number][] = [];
  for (const [, h] of items) {
    const v = h.op.value;
    const t = Date.parse(`${h.timestamp}Z`);
    if (h.op.type === 'transfer_to_vesting_completed_operation') {
      const hive = units(v.hive_vested);
      const vests = units(v.vesting_shares_received);
      if (hive > 0 && vests > 0) out.push([t, hive / vests]);
    } else if (h.op.type === 'fill_vesting_withdraw_operation' && symbolOf(v.deposited) === 'HIVE') {
      const hive = units(v.deposited);
      const vests = units(v.withdrawn);
      if (hive > 0 && vests > 0) out.push([t, hive / vests]);
    }
  }
  return out;
}

async function currentRate(): Promise<[number, number]> {
  const g = await rpc<{ total_vesting_fund_hive: Asset; total_vesting_shares: Asset }>('database_api.get_dynamic_global_properties', {});
  return [Date.now(), units(g.total_vesting_fund_hive) / units(g.total_vesting_shares)];
}

export interface HiveResult {
  /** 'hive:<account>' per account */
  entries: TaxEntry[];
  errors: { account: string; error: string }[];
  counts: Record<string, number>;
}

/**
 * Every Hive account's HIVE/HBD money flows since the fork, as tax legs. Transfers between the
 * owner's own accounts (and to/from Hive Engine's peg) are left for acb.ts's own-address rule to
 * skip; claimed rewards, HBD interest, witness and proposal pay are marked as income.
 * Each account's legs are cached for 30 minutes in compact form, without memos (@mes's ~5,000
 * operations take ~13s to read, and the raw history would be too big for one Redis value).
 */
interface AccountData {
  legs: HiveLeg[];
  samples: [number, number][];
  operations: number;
}

async function loadAccount(account: string): Promise<AccountData> {
  const items = await getMoneyHistory(account);
  return { legs: toLegs(account, items), samples: rateSamples(items), operations: items.length };
}

export async function getHiveEntries(): Promise<HiveResult> {
  const settled = await Promise.allSettled(
    HIVE_ACCOUNTS.map((a) => cached(cacheKey('hive-money-legs-v1', a), () => loadAccount(a), 30 * 60)),
  );
  const errors: HiveResult['errors'] = [];
  const accounts: [string, AccountData][] = [];
  settled.forEach((r, i) => {
    const account = HIVE_ACCOUNTS[i]!;
    if (r.status === 'fulfilled') accounts.push([account, r.value]);
    else errors.push({ account, error: r.reason instanceof Error ? r.reason.message : 'failed to load' });
  });

  const samples = accounts.flatMap(([, d]) => d.samples);
  try {
    samples.push(await cached(cacheKey('hive-vests-rate-now'), currentRate, 6 * 3600));
  } catch {
    // interpolation still works from the history's own samples
  }
  const rateAt = vestsRate(samples);

  const legs = accounts.flatMap(([, d]) => d.legs).map((l) => (l.vests ? { ...l, amount: l.amount + l.vests * rateAt(Date.parse(l.timestamp)) } : l));
  const [hive, hbd] = await Promise.all([getDailySeries('hive', HIVE_FORK), getDailySeries('hive_dollar', HIVE_FORK)]);

  const entries: TaxEntry[] = legs.map((l) => ({
    source: `hive:${l.account}`,
    hash: l.hash,
    network: 'hive',
    timestamp: l.timestamp,
    symbol: l.symbol,
    amount: l.amount,
    priceUsd: priceOn(l.symbol === 'HIVE' ? hive : hbd, l.timestamp),
    from: l.from,
    to: l.to,
    income: l.income,
    // HIVE <-> Hive Engine's peg is the owner's own coin changing ledger, but Hive Engine isn't tracked
    // yet: it leaves at cost (no gain) and comes back at the day's value - see TaxEntry.bridge
    bridge: BRIDGES.has(l.from) || BRIDGES.has(l.to) || undefined,
  }));

  const counts: Record<string, number> = {};
  for (const [account, d] of accounts) counts[account] = d.operations;
  // sanity: every Hive account used above is on the own-address list
  for (const a of HIVE_ACCOUNTS) if (!isOwnAddress(a)) errors.push({ account: a, error: 'missing from ownAddresses.ts' });
  return { entries, errors, counts };
}
