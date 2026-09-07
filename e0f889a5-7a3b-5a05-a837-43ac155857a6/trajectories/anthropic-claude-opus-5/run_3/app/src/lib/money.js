// Money is an integer count of minor units in usd everywhere in this app,
// in every layer including the browser. No floating point money exists.

/** 37800 -> "$378.00" */
export function formatMoney(minor) {
  const n = Math.trunc(Number(minor));
  const neg = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${grouped}.${String(cents).padStart(2, '0')}`;
}

/** 41580 -> "415.80". The decimal string the billing platform is given. */
export function minorToDecimalString(minor) {
  const n = Math.trunc(Number(minor));
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Tax is ten percent of the line subtotal, on integers, truncated toward zero. */
export function taxFor(subtotalMinor) {
  return Math.trunc(Math.trunc(Number(subtotalMinor)) / 10);
}

// Shipment protection rungs, chosen from the cart subtotal in minor units.
export const PROTECTION_RUNGS = [
  { sku: 'VELA-PROTECT-1', price_minor: 98, min: 1, max: 9999 },
  { sku: 'VELA-PROTECT-2', price_minor: 298, min: 10000, max: 49999 },
  { sku: 'VELA-PROTECT-3', price_minor: 598, min: 50000, max: 99999 },
  { sku: 'VELA-PROTECT-4', price_minor: 1198, min: 100000, max: Infinity },
];

export function protectionRungFor(subtotalMinor) {
  const s = Math.trunc(Number(subtotalMinor));
  if (s < 1) return null;
  return PROTECTION_RUNGS.find((r) => s >= r.min && s <= r.max) ?? null;
}

export function formatBytes(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
