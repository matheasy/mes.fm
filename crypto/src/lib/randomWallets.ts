/**
 * mes.fm/random-wallets - old wallets and exchange accounts the owner no longer uses or can't get into
 * any more, kept for reference only. Hand-maintained: nothing here is fetched, and none of it is added
 * to Assets, Transactions, the Portfolio total or the Taxes calculation. To add one, append an entry
 * (newest snapshot date first within an account is fine; the page sorts accounts by value).
 */

export interface RandomHolding {
  symbol: string;
  name?: string;
  amount: number;
  /** Value when the snapshot was taken, in the account's own quote currency (usually USDT/USD) */
  value: number | null;
}

export interface RandomWallet {
  name: string;
  kind: 'Exchange' | 'Wallet';
  /** Where to log in / look it up */
  link?: string;
  /** e.g. "Can still log in", "No access (lost 2FA)", "Exchange closed" */
  status: string;
  /** Date of the screenshot / statement the numbers come from (YYYY-MM-DD) */
  asOf: string;
  /** Quote currency of `total` and each holding's value */
  currency: string;
  total: number | null;
  /** The total in BTC, if the source shows it */
  totalBtc?: number;
  holdings: RandomHolding[];
  notes?: string;
}

export const RANDOM_WALLETS: RandomWallet[] = [
  {
    name: 'Bitrue - Funding account',
    kind: 'Exchange',
    link: 'https://www.bitrue.com',
    status: 'Not used any more',
    asOf: '2026-10-02',
    currency: 'USDT',
    total: 51.52,
    totalBtc: 0.00060963,
    holdings: [{ symbol: 'BTR', name: 'Bitrue Coin', amount: 3659.38699511, value: 51.52 }],
    notes: 'Bitrue\'s exchange coin, held in the Funding account (separate from Spot).',
  },
  {
    name: 'Bitrue - Spot account',
    kind: 'Exchange',
    link: 'https://www.bitrue.com',
    status: 'Not used any more',
    asOf: '2026-10-02',
    currency: 'USDT',
    total: 10.65,
    totalBtc: 0.00012598,
    holdings: [
      { symbol: 'BNB', name: 'Binance Coin', amount: 0.008, value: 6.12 },
      { symbol: 'USDT', name: 'Tether USDt', amount: 2.85, value: 2.85 },
      { symbol: 'FLOKI', name: 'Floki Inu', amount: 32193.9, value: 0.85 },
      { symbol: 'XRP', name: 'XRP', amount: 0.377382, value: 0.55 },
      { symbol: 'EGLD', name: 'MultiversX', amount: 0.033, value: 0.2 },
      { symbol: 'KINIC', name: 'Kinic', amount: 0.29, value: 0.04 },
      { symbol: 'MEGALAND', name: 'Metagalaxy Land', amount: 419202525, value: 0 },
      { symbol: 'SAGAW', name: 'SagaWorld', amount: 1147142, value: 0 },
      { symbol: 'AVXT', name: 'Avaxtars Token', amount: 2207, value: 0 },
      { symbol: 'STC', name: 'SaitaChain', amount: 774.93912277, value: 0 },
      { symbol: 'MLP', name: 'MLP Token', amount: 357.86, value: 0 },
      { symbol: 'TOKO', name: 'Tokoin', amount: 275.90275206, value: 0 },
      { symbol: 'SARA', name: 'Pulsara', amount: 63.1255, value: 0 },
      { symbol: 'CLXY', name: 'Calaxy Tokens', amount: 16.848081, value: 0 },
    ],
    notes:
      'From a screenshot of the account\'s asset list: 23 coins held, the 14 above were on screen (the other 9 are worth about $0.04 together).',
  },
];
