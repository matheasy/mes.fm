/**
 * Converts a raw integer amount in the smallest unit (e.g. wei) to a decimal number, without
 * going through `Number(bigint)` first - that loses precision above 2^53 wei, which ordinary
 * wallet balances (BNB has 18 decimals) regularly exceed.
 */
export function formatUnits(rawValue: string | bigint, decimals: number): number {
  const negative = typeof rawValue === 'string' ? rawValue.startsWith('-') : rawValue < 0n;
  const abs = (typeof rawValue === 'string' ? BigInt(rawValue) : rawValue) * (negative ? -1n : 1n);

  const divisor = 10n ** BigInt(decimals);
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(decimals, '0');
  const str = `${negative ? '-' : ''}${whole}.${fraction}`;
  return Number(str);
}

export function weiToBnb(wei: string): number {
  return formatUnits(wei, 18);
}

export function gasFeeBnb(gasUsed: string, gasPriceWei: string): number {
  const feeWei = BigInt(gasUsed) * BigInt(gasPriceWei);
  return formatUnits(feeWei, 18);
}
