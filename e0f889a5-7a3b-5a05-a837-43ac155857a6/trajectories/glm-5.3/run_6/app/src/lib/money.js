// Money is an integer count of minor units everywhere inside this app.
// No floating point money exists in any layer; the browser receives minor
// units and formats them for display.

export function formatUsd(minor) {
  const n = Number(minor);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}$${dollars.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;
}

// Minor units -> decimal string for the billing platform, e.g. 41580 -> "415.80"
export function minorToDecimalString(minor) {
  const n = Number(minor);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

// Ten percent of the line subtotal, computed on integers, truncated toward zero.
export function taxFor(subtotalMinor) {
  return Math.trunc((Number(subtotalMinor) * 10) / 100);
}

export function sumTotals({ subtotal, shipping, tax, discount = 0 }) {
  return subtotal + shipping + tax - discount;
}
