export { formatMinor, formatBytes } from '../../server/money.js';

export function formatDate(value) {
  if (!value) return '';
  const s = String(value);
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function formatDateShort(value) {
  if (!value) return '';
  const s = String(value);
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit', timeZone: 'UTC' });
}
