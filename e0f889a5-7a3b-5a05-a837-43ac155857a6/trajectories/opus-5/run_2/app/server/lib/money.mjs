// Money is an integer count of minor units in usd everywhere inside this app.
// No floating point money exists anywhere; the only decimal is the string handed
// to the billing platform at the boundary.

export const TAX_RATE_NUMERATOR = 10;
export const TAX_RATE_DENOMINATOR = 100;

/** Ten percent of the line subtotal, on integers, truncated toward zero. */
export function taxFor(subtotalMinor) {
  return Math.trunc((subtotalMinor * TAX_RATE_NUMERATOR) / TAX_RATE_DENOMINATOR);
}

/** `37800` -> `$378.00` */
export function formatMoney(minor, currency = 'usd') {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const sign = negative ? '-' : '';
  const symbol = currency.toLowerCase() === 'usd' ? '$' : '';
  return `${sign}${symbol}${whole.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;
}

/** `41580` -> `"415.80"`, the decimal string the billing platform is given. */
export function minorToDecimalString(minor) {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${negative ? '-' : ''}${whole}.${String(cents).padStart(2, '0')}`;
}

export const PROTECTION_RUNGS = [
  { sku: 'VELA-PROTECT-1', price_minor: 98, min: 1, max: 9999 },
  { sku: 'VELA-PROTECT-2', price_minor: 298, min: 10000, max: 49999 },
  { sku: 'VELA-PROTECT-3', price_minor: 598, min: 50000, max: 99999 },
  { sku: 'VELA-PROTECT-4', price_minor: 1198, min: 100000, max: Infinity },
];

/** The rung is derived from the cart subtotal, never stored. */
export function protectionRungFor(subtotalMinor) {
  if (subtotalMinor < 1) return null;
  return PROTECTION_RUNGS.find((r) => subtotalMinor >= r.min && subtotalMinor <= r.max) || null;
}
