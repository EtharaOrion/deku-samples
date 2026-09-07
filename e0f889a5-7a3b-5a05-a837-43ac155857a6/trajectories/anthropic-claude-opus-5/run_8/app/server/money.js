// Money is an integer count of minor units in usd, in every layer.
// No floating point money exists anywhere in this app.

export function formatMinor(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  const dollars = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${grouped}.${String(cents).padStart(2, '0')}`;
}

// killbill wants a decimal. Build it from the integer, never via division into a float.
export function minorToDecimalString(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Ten percent of the taxable subtotal, computed on integers, truncated toward zero.
export function taxOn(taxableSubtotalMinor) {
  return Math.trunc(Math.trunc(taxableSubtotalMinor) / 10);
}

export function formatBytes(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
