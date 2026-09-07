// Money is an integer count of minor units everywhere inside this app. These
// helpers are the only place a minor-unit integer becomes a string, and they
// never go through a float.

export const TAX_NUMERATOR = 1;
export const TAX_DENOMINATOR = 10;

/** Format 41580 as "$415.80". Integer arithmetic only. */
export function formatMinor(minor, currency = 'usd') {
  const n = Number(minor);
  if (!Number.isInteger(n)) throw new TypeError(`formatMinor expects an integer, received ${minor}`);
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = currency.toLowerCase() === 'usd' ? '$' : '';
  return `${negative ? '-' : ''}${symbol}${grouped}.${String(cents).padStart(2, '0')}`;
}

/** Ten percent of the line subtotal, on integers, truncated toward zero. */
export function taxOn(subtotalMinor) {
  return Math.trunc((subtotalMinor * TAX_NUMERATOR) / TAX_DENOMINATOR);
}

/** killbill takes a decimal; this is the one boundary where that is correct. */
export function minorToDecimalString(minor) {
  const n = Number(minor);
  const negative = n < 0;
  const abs = Math.abs(n);
  return `${negative ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** The shipment-protection rung is derived from the cart subtotal, never stored. */
export function protectionRungFor(subtotalMinor) {
  if (subtotalMinor >= 100000) return { sku: 'VELA-PROTECT-4', price_minor: 1198 };
  if (subtotalMinor >= 50000) return { sku: 'VELA-PROTECT-3', price_minor: 598 };
  if (subtotalMinor >= 10000) return { sku: 'VELA-PROTECT-2', price_minor: 298 };
  if (subtotalMinor >= 1) return { sku: 'VELA-PROTECT-1', price_minor: 98 };
  return null;
}
