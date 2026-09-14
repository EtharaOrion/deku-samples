// Money is an integer count of minor units everywhere in this app.
// No floating point money exists in any layer.

export function moneyFormat(minor, currency = 'USD') {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Number(minor));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}$${whole}.${String(cents).padStart(2, '0')}`;
}

export function minorToDecimalString(minor) {
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Number(minor));
  const whole = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}${whole}.${String(cents).padStart(2, '0')}`;
}

// Tax is ten percent of the line subtotal, computed on integers, truncated toward zero.
export function taxFor(subtotalMinor) {
  return Math.trunc((subtotalMinor * 10) / 100);
}
