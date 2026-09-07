// Money is an integer count of minor units in usd, everywhere, in every layer.
// Nothing in this file produces a float.

export function formatMinor(minor) {
  const n = Number(minor) | 0;
  const negative = n < 0;
  const abs = Math.abs(n);
  const dollars = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${negative ? '-' : ''}$${dollars.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;
}

// The decimal string the billing platform is given: derived from the same integer.
export function minorToDecimalString(minor) {
  const n = Number(minor) | 0;
  const negative = n < 0;
  const abs = Math.abs(n);
  return `${negative ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Ten percent of the taxable subtotal, on integers, truncated toward zero.
export function taxFor(taxableSubtotalMinor) {
  return Math.trunc(Number(taxableSubtotalMinor) / 10);
}

export const PROTECTION_RUNGS = [
  { sku: 'VELA-PROTECT-1', price_minor: 98, from: 1, to: 9999 },
  { sku: 'VELA-PROTECT-2', price_minor: 298, from: 10000, to: 49999 },
  { sku: 'VELA-PROTECT-3', price_minor: 598, from: 50000, to: 99999 },
  { sku: 'VELA-PROTECT-4', price_minor: 1198, from: 100000, to: Number.MAX_SAFE_INTEGER },
];

export function protectionRungFor(subtotalMinor) {
  const s = Number(subtotalMinor) | 0;
  if (s < 1) return PROTECTION_RUNGS[0];
  return PROTECTION_RUNGS.find((r) => s >= r.from && s <= r.to) || PROTECTION_RUNGS[3];
}
