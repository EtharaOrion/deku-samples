export { formatMinor, minorToDecimalString } from '../../server/money.js';

export function formatBytes(bytes) {
  const n = Number(bytes);
  return `${n.toLocaleString('en-US')} bytes`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function formatDate(value) {
  if (!value) return '';
  const s = typeof value === 'string' ? value : value.toISOString();
  const [y, m, d] = s.slice(0, 10).split('-').map((p) => Number.parseInt(p, 10));
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  const s = typeof value === 'string' ? value : value.toISOString();
  return `${formatDate(s)} at ${s.slice(11, 16)} UTC`;
}

export function groupSerial(serial) {
  const s = String(serial || '').toUpperCase();
  return s.replace(/(.{4})(?=.)/g, '$1 ');
}
