// Server-side helpers shared by the Astro pages. The pages run in the same
// process as the API, so they read the database directly and never call their
// own HTTP endpoints.
import { customerFromToken } from './customers.js';
import { findCartByToken, readCart, newCartToken } from './cart.js';
import { verifyPassword, issueToken } from './tokens.js';

export const CART_COOKIE = 'vela_cart';
export const SESSION_COOKIE = 'vela_session';

export async function currentCustomer(request) {
  const auth = request.headers.get('authorization');
  if (auth && /^bearer\s+/i.test(auth)) {
    const token = auth.replace(/^bearer\s+/i, '');
    return customerFromToken(token);
  }
  const token = cookieFrom(request, SESSION_COOKIE);
  if (!token) return null;
  return customerFromToken(token);
}

export function cookieFrom(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function cartTokenFor(request) {
  return cookieFrom(request, CART_COOKIE);
}

export async function cartForPage(request) {
  const token = cookieFrom(request, CART_COOKIE);
  const cart = token ? await findCartByToken(token) : null;
  if (!cart) return { cart: null, token, cartView: emptyCartView() };
  const cartView = await readCart(cart, { markSeen: true });
  return { cart, token, cartView };
}

export function emptyCartView() {
  return {
    token: null, email: null, lines: [], item_count: 0, subtotal_minor: 0,
    protection: { enabled: false, rung: null, price_minor: 0, price_display: null },
    shipping_minor: null, tax_minor: null, total_minor: null, notices: [],
    shipping_address: null, shipping_method: null, shipping_methods: null,
    marketing_consent: false
  };
}

export function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function formatShortDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '';
  const mb = n / (1000 * 1000);
  return `${mb.toFixed(1)} MB`;
}
