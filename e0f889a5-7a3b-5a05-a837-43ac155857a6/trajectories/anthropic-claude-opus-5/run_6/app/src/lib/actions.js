import { cartByToken, createCart } from '../../server/services/cart.js';
import { customerForToken } from '../../server/services/auth.js';

export const AUTH_COOKIE = 'vela_token';
export const CART_COOKIE = 'vela_cart';
export const FLASH_COOKIE = 'vela_flash';

const COOKIE = { path: '/', httpOnly: false, sameSite: 'lax', maxAge: 60 * 60 * 24 * 30 };

export async function customerFromCookies(cookies) {
  const token = cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return customerForToken(token);
}

export async function cartFromCookies(cookies, { create = true } = {}) {
  const token = cookies.get(CART_COOKIE)?.value;
  const existing = await cartByToken(token);
  if (existing) return existing;
  if (!create) return null;
  const customer = await customerFromCookies(cookies);
  const cart = await createCart(customer ? customer.id : null);
  cookies.set(CART_COOKIE, cart.token, COOKIE);
  return cart;
}

export function setCookie(cookies, name, value, options = {}) {
  cookies.set(name, value, { ...COOKIE, ...options });
}

export function setFlash(cookies, payload) {
  cookies.set(FLASH_COOKIE, JSON.stringify(payload), { ...COOKIE, maxAge: 60 });
}

export function takeFlash(cookies) {
  const raw = cookies.get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  cookies.delete(FLASH_COOKIE, { path: '/' });
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function redirect(to) {
  return new Response(null, { status: 303, headers: { Location: to } });
}

// A form post must come from a page of this site: same host, or no Origin at all
// (which is what a form submitted from a document without JavaScript may send).
export function sameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}

export async function formValues(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}));
    return body || {};
  }
  const data = await request.formData();
  const out = {};
  for (const [k, v] of data.entries()) out[k] = typeof v === 'string' ? v : '';
  return out;
}
