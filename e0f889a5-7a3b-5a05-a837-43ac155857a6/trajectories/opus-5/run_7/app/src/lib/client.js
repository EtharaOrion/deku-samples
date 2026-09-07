// Browser-side helpers. Money stays an integer count of minor units here too.

export function readCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function writeCookie(name, value, maxAgeSeconds = 60 * 60 * 24 * 30) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

export const CART_COOKIE = 'vela_cart';
export const SESSION_COOKIE = 'vela_session';

export function cartToken() {
  return readCookie(CART_COOKIE);
}

export function sessionToken() {
  return readCookie(SESSION_COOKIE);
}

/** Call the app's own API. Errors carry a code, a message and the request id. */
export async function api(path, { method = 'GET', body, headers = {}, auth = false } = {}) {
  const token = cartToken();
  const session = sessionToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { 'x-cart-token': token } : {}),
      ...(auth && session ? { authorization: `Bearer ${session}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const err = new Error((data && data.message) || 'That did not work.');
    err.code = data?.code || 'error';
    err.status = res.status;
    err.requestId = data?.request_id || null;
    err.data = data;
    throw err;
  }

  // The cart's opaque token is the only handle a visitor ever holds.
  if (data && data.cart && data.cart.token) writeCookie(CART_COOKIE, data.cart.token);
  return data;
}

export function formatMinor(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}$${Math.trunc(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

export function announce(message) {
  const region = document.getElementById('live-region');
  if (region) region.textContent = message;
}

/** Broadcast the cart count so the header control keeps up without a reload. */
export function publishCartCount(count) {
  window.dispatchEvent(new CustomEvent('vela:cart', { detail: { count } }));
}
