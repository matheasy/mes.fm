/**
 * Every address / account the owner holds, across every chain mes.fm tracks (the same list as
 * mes.fm/assets' GROUPS in assets/src/lib/config.ts - keep the two in step). A transfer whose other
 * side is one of these is the owner moving their own coins, which is not a disposition for tax
 * purposes, so the ACB calculation skips it (see acb.ts).
 *
 * Deposits to an exchange account (Shakepay etc.) can't be recognised this way - the deposit
 * address isn't known to be the owner's - so those rows are labelled "Personal transfer" on the
 * Taxes page instead, which the calculation honours.
 */
const OWN = [
  // EVM (same address on BNB Chain, Ethereum, Arbitrum, Polygon, Hyperliquid/HyperEVM)
  '0xe6c0634d02ae5f136500ac9428ed5d9576695ef9', // Main wallet
  '0x89ac35e57216a51cf08f1c14b3ce19d6813ee492', // AI Trading
  '0xaef8a5ab45652bc612b2ce72b0631c9e052404a5', // MikeFA Trading
  // XRP Ledger
  'rDqSZAsxSEBoTgPGDbSqKEtrEe4JxKkDNh',
  // Bitcoin
  'bc1q3tet9kazk8v59ptfqr6f0945fvj7g4xwnlyzy8',
  // Hive accounts (Hive Engine TGLD transfers name the account)
  'mes',
  'mestruth',
  'mathiew',
  'artgrafiken',
];

const OWN_SET = new Set(OWN.map((a) => a.toLowerCase()));

export function isOwnAddress(address: string | null | undefined, extra?: ReadonlySet<string>): boolean {
  if (!address) return false;
  const a = address.toLowerCase();
  return OWN_SET.has(a) || (extra?.has(a) ?? false);
}
