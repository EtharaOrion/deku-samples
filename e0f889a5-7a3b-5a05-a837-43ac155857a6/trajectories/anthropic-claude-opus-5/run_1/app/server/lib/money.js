// Money is an integer count of minor units everywhere inside this app.
// No floating point money exists in any layer.

export function formatMinor(minor) {
  const n = Number(minor);
  const neg = n < 0;
  const abs = Math.abs(Math.trunc(n));
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${grouped}.${String(cents).padStart(2, '0')}`;
}

// Decimal string for the billing platform, derived from integer minor units.
export function minorToDecimalString(minor) {
  const n = Math.trunc(Number(minor));
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Ten percent of the taxable subtotal, on integers, truncated toward zero.
export function taxFor(taxableSubtotalMinor) {
  return Math.trunc(Math.trunc(Number(taxableSubtotalMinor)) / 10);
}

export const PROTECTION_RUNGS = [
  { sku: 'VELA-PROTECT-1', price_minor: 98, min: 1, max: 9999 },
  { sku: 'VELA-PROTECT-2', price_minor: 298, min: 10000, max: 49999 },
  { sku: 'VELA-PROTECT-3', price_minor: 598, min: 50000, max: 99999 },
  { sku: 'VELA-PROTECT-4', price_minor: 1198, min: 100000, max: Infinity },
];

export function protectionRungFor(subtotalMinor) {
  const s = Math.trunc(Number(subtotalMinor));
  if (s < 1) return null;
  return PROTECTION_RUNGS.find((r) => s >= r.min && s <= r.max) || null;
}
