// Server-side helpers shared by the Astro routes. Pages read the database
// through the same services the API uses, so a page and an endpoint can never
// disagree about the facts.
export { customerForToken } from '../../server/services/auth.js';
export { listProducts, getProduct } from '../../server/services/catalogue.js';
export * as carts from '../../server/services/cart.js';
export * as orders from '../../server/services/orders.js';
export * as devices from '../../server/services/devices.js';
export * as firmware from '../../server/services/firmware.js';
export { formatMinor, minorToDecimalString } from '../../server/lib/money.js';
export { SHIPPING_METHODS } from '../../server/seed.js';

import { customerForToken as _customerForToken } from '../../server/services/auth.js';
import { cartByToken, readCart } from '../../server/services/cart.js';

export const CART_COOKIE = 'vela_cart';
export const SESSION_COOKIE = 'vela_session';

export async function currentCustomer(Astro) {
  const token = Astro.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await _customerForToken(token);
  } catch {
    return null;
  }
}

export async function currentCart(Astro, { create = false } = {}) {
  const token = Astro.cookies.get(CART_COOKIE)?.value;
  const customer = await currentCustomer(Astro);
  const row = await cartByToken(token, { create, customerId: customer?.id ?? null });
  if (!row) return null;
  if (row.token !== token) {
    Astro.cookies.set(CART_COOKIE, row.token, {
      path: '/', httpOnly: true, sameSite: 'lax', maxAge: 2592000,
    });
  }
  return row;
}

export async function cartSummary(Astro) {
  try {
    const row = await currentCart(Astro);
    if (!row) return { item_count: 0, lines: [], subtotal_minor: 0, notices: [] };
    return await readCart(row);
  } catch {
    return { item_count: 0, lines: [], subtotal_minor: 0, notices: [] };
  }
}

// A signed-out request for an account route lands on /sign-in carrying the
// intended path and returns there after signing in.
export function signInRedirect(Astro) {
  const path = Astro.url.pathname + (Astro.url.search || '');
  return Astro.redirect(`/sign-in?next=${encodeURIComponent(path)}`, 302);
}

export function formatDateLong(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  const mb = n / 1_000_000;
  return `${mb.toFixed(1)} MB`;
}
