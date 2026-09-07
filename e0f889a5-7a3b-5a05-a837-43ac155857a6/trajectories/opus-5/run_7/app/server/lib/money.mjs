// Money is an integer count of minor units in usd everywhere inside this app.
// No floating point money exists in any layer.

export function formatMinor(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  const dollars = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${neg ? '-' : ''}$${dollars.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;
}

/** The decimal string a billing platform expects, e.g. 41580 -> "415.80". */
export function minorToDecimalString(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Ten percent of the line subtotal, on integers, truncated toward zero. */
export function taxFor(subtotalMinor) {
  return Math.trunc(Math.max(0, Math.trunc(subtotalMinor)) / 10);
}

// The four shipment-protection rungs, chosen from the cart subtotal.
export const PROTECTION_RUNGS = [
  { sku: 'VELA-PROTECT-1', price_minor: 98, min: 1, max: 9999 },
  { sku: 'VELA-PROTECT-2', price_minor: 298, min: 10000, max: 49999 },
  { sku: 'VELA-PROTECT-3', price_minor: 598, min: 50000, max: 99999 },
  { sku: 'VELA-PROTECT-4', price_minor: 1198, min: 100000, max: Number.MAX_SAFE_INTEGER },
];

export function protectionRungFor(subtotalMinor) {
  const s = Math.trunc(subtotalMinor);
  if (s < 1) return null;
  return PROTECTION_RUNGS.find((r) => s >= r.min && s <= r.max) || null;
}
