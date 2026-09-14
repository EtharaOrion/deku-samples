/** Money is an integer count of minor units in usd, everywhere. No floats. */

export function centsToDecimalString(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${dollars}.${String(cents).padStart(2, '0')}`;
}

export function dollars(minor) {
  return `$${centsToDecimalString(minor)}`;
}

export function taxFromSubtotal(subtotalMinor) {
  // Ten percent, computed on integers, truncated toward zero.
  // 37800 -> 3780. No floating point anywhere.
  return Math.trunc((subtotalMinor * 10) / 100);
}

export { centsToDecimalString as minorToDecimal };
