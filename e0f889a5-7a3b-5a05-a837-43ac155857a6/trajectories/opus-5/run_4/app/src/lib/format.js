// Money stays an integer count of minor units in every layer including the
// browser. This is the only place it becomes a string, and it never goes
// through a float.
export function formatMinor(minor, currency = 'usd') {
  const n = Number(minor);
  const negative = n < 0;
  const abs = Math.abs(Math.trunc(n));
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = String(currency).toLowerCase() === 'usd' ? '$' : '';
  return `${negative ? '-' : ''}${symbol}${grouped}.${String(cents).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  return `${Number(bytes).toLocaleString('en-US')} bytes`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** Dates are rendered from their parts so a timezone can never shift one. */
export function formatDate(value) {
  if (!value) return '';
  const iso = String(value).slice(0, 10);
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  return formatDate(new Date(value).toISOString());
}

export function groupSerial(raw) {
  return String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/(.{4})(?=.)/g, '$1 ').trim();
}
