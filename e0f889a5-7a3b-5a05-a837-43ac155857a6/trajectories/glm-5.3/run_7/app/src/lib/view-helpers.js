// Helpers shared by the SSR pages.
import { q } from '../lib/db.js';
import { cartLines } from './store.js';
import { moneyFormat } from './money.js';

export async function getCartCount(token) {
  if (!token) return 0;
  const rows = await q('SELECT id FROM cart WHERE token = $1', [token]);
  if (!rows.length) return 0;
  const lines = await cartLines(rows[0].id);
  return lines.reduce((s, l) => s + Number(l.quantity), 0);
}

export async function cartForToken(token) {
  if (!token) return null;
  const rows = await q('SELECT * FROM cart WHERE token = $1', [token]);
  return rows.length ? rows[0] : null;
}

export function dateLong(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function money(minor) {
  return moneyFormat(minor);
}

export function bytes(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
