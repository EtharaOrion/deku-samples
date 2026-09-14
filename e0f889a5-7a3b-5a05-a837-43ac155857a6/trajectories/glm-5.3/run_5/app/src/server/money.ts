/** Money is an integer count of minor units. No floating point anywhere in this file. */

/** Format minor units as a dollar string, e.g. 41580 -> "$415.80". */
export function dollars(minor: number | null | undefined): string {
  const n = Number(minor ?? 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(n));
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}$${whole}.${String(rest).padStart(2, '0')}`;
}

/** Express minor units as a decimal string for the billing platform, e.g. 41580 -> "415.80". */
export function decimal(minor: number): string {
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  const sign = minor < 0 ? '-' : '';
  return `${sign}${whole}.${String(rest).padStart(2, '0')}`;
}

/** Ten percent of a subtotal, truncated toward zero, computed on integers. */
export function taxOf(subtotalMinor: number): number {
  return Math.trunc((subtotalMinor * 10) / 100);
}

/** Parse a decimal string into minor units without floating point. */
export function minorFromDecimal(s: string): number {
  const m = /^(-?)(\d+)\.(\d{1,2})$/.exec(String(s).trim());
  if (m) {
    const frac = (m[2] + '00').slice(0, 2);
    return Number(m[1] === '-' ? -1 : 1) * (Number(m[2]) * 100 + Number(frac));
  }
  const m2 = /^(-?)(\d+)$/.exec(String(s).trim());
  if (m2) return Number(m2[2]) * 100 * (m2[1] === '-' ? -1 : 1);
  throw new Error(`Not a decimal amount: ${s}`);
}
