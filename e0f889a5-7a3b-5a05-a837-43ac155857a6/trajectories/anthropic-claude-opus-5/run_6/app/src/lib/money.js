// Money in the browser is the same integer count of minor units the server holds.
export function formatMinor(minor) {
  const n = Number(minor) | 0;
  const negative = n < 0;
  const abs = Math.abs(n);
  const dollars = Math.trunc(abs / 100);
  const cents = abs % 100;
  return `${negative ? '-' : ''}$${dollars.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;
}
