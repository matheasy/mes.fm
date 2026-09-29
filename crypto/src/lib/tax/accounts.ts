/**
 * The owner's native Bitcoin address and Hive accounts - plain constants, kept apart from the
 * sources/ loaders (which import the Redis cache) so client components can use them too.
 * Same as mes.fm/assets' `btc` and Hive groups (assets/src/lib/config.ts).
 */
export const BTC_ADDRESS = 'bc1q3tet9kazk8v59ptfqr6f0945fvj7g4xwnlyzy8';

export const HIVE_ACCOUNTS = ['mes', 'mestruth', 'mathiew', 'artgrafiken'] as const;
