/* Run: npx tsx scripts/ledger-store-tests.ts  - the permanent store's merge rule (lib/store/ledgerStore.ts) */
import { mergeSource, type SourceData } from '../src/lib/store/ledgerStore';
import type { TaxEntry } from '../src/lib/tax/acb';

let fails = 0;
const ok = (c: boolean, m: string) => {
  if (!c) fails++;
  console.log(`${c ? 'ok  ' : 'FAIL'} ${m}`);
};
const leg = (hash: string, t: string, amount = 1, price: number | null = 10): TaxEntry => ({
  source: 'main', hash, network: 'bsc', timestamp: t, symbol: 'BNB', amount, priceUsd: price, from: 'a', to: 'b',
});
const d = (tax: TaxEntry[]): SourceData => ({ tax, tx: [] });

const stored = d([leg('h1', '2024-01-01T00:00:00Z'), leg('h2', '2024-02-01T00:00:00Z')]);

let r = mergeSource(null, stored);
ok(r.data.tax.length === 2 && r.added === 2 && !r.missing.length, 'first store takes everything');

r = mergeSource(stored, d([leg('h1', '2024-01-01T00:00:00Z', 1, 11), leg('h2', '2024-02-01T00:00:00Z'), leg('h3', '2024-03-01T00:00:00Z')]));
ok(r.data.tax.length === 3 && r.added === 1 && !r.missing.length, 'a superset replaces the copy and counts 1 new row');
ok(r.data.tax[0]!.priceUsd === 11, 'corrections (a better price) are taken');

r = mergeSource(stored, d([leg('h2', '2024-02-01T00:00:00Z'), leg('h3', '2024-03-01T00:00:00Z')]));
ok(r.missing.length === 1, 'a row the source no longer returns is reported');
ok(r.data.tax.length === 3 && r.data.tax.some((e) => e.hash === 'h1'), '... and kept, while the newer row is still added');

r = mergeSource(stored, d([leg('X1', '2024-01-01T00:00:00Z'), leg('X2', '2024-02-01T00:00:00Z'), leg('X3', '2024-03-01T00:00:00Z')]));
ok(r.data.tax.length === 3 && r.data.tax.filter((e) => e.hash.startsWith('X')).length === 1, 'changed identifiers: old rows kept, only rows newer than the copy appended (no double counting)');

r = mergeSource(stored, d([]));
ok(r.data.tax.length === 2 && r.missing.length === 2, 'an empty answer never wipes the copy');

r = mergeSource(stored, d([leg('h2', '2024-02-01T00:00:00Z')]), true);
ok(r.data.tax.length === 1, 'a rebuild (asked for by a person) takes the fresh copy as it is');

const twin = d([leg('h1', '2024-01-01T00:00:00Z'), leg('h1', '2024-01-01T00:00:00Z')]);
r = mergeSource(twin, d([leg('h1', '2024-01-01T00:00:00Z'), leg('h1', '2024-01-01T00:00:00Z')]));
ok(r.data.tax.length === 2 && !r.missing.length && r.added === 0, 'two identical-looking legs of one transaction stay two');
r = mergeSource(twin, d([leg('h1', '2024-01-01T00:00:00Z')]));
ok(r.missing.length === 1 && r.data.tax.length === 2, '... and losing one of them is caught');

console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
