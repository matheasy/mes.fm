export function usd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Price: keeps significant digits for sub-cent tokens instead of rounding them to $0.00 */
export function price(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value >= 1) return usd(value, 2);
  if (value >= 0.01) return usd(value, 4);
  return `$${value.toPrecision(3)}`;
}

export function amount(value: number): string {
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return value.toLocaleString('en-US', { maximumSignificantDigits: 4 });
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (secs < 90) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 90) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}
