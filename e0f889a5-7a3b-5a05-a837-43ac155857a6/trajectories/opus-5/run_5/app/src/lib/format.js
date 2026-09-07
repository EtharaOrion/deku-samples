// Money is an integer count of minor units in every layer including the browser.
// No floating point money exists anywhere.

export function formatMinor(minor) {
  const n = Math.trunc(Number(minor));
  const neg = n < 0;
  const abs = Math.abs(n);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${grouped}.${String(cents).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('en-US')} bytes`;
}

export function formatDateLong(value) {
  if (!value) return '';
  const d = new Date(typeof value === 'string' && value.length === 10 ? `${value}T00:00:00Z` : value);
  return d.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

export function formatDateShort(value) {
  if (!value) return '';
  const d = new Date(typeof value === 'string' && value.length === 10 ? `${value}T00:00:00Z` : value);
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC',
  });
}

/** Group a serial as it is typed, though it is always stored unformatted. */
export function groupSerial(raw) {
  const clean = String(raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  return clean.replace(/(.{4})(?=.)/g, '$1 ').trim();
}

export const unformatSerial = (raw) =>
  String(raw ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
