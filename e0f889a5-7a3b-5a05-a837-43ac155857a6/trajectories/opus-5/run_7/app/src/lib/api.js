// Server-side helpers for Astro routes. Pages fetch this app's own API on the
// same origin so first paint carries complete markup.

export function apiOrigin(request) {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Call the app's own API during server rendering. The server hands the API's
 * fetch handler over on globalThis, so a page renders in process rather than
 * making a network round trip back to itself; the network path stays as a
 * fallback. Never throws on a client error.
 */
export async function apiGet(request, path, { token, cartToken, headers = {} } = {}) {
  const url = `${apiOrigin(request)}/api${path}`;
  const init = {
    headers: {
      accept: 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cartToken ? { 'x-cart-token': cartToken } : {}),
      ...headers,
    },
  };

  const inProcess = globalThis.__velaApiFetch;
  const res = inProcess
    ? await inProcess(new Request(url, init))
    : await fetch(url, init);

  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { ok: res.ok, status: res.status, data: json };
}

/** The same, for the mutating calls a page makes on a form submission. */
export async function apiSend(request, path, { method = 'POST', body, token, cartToken, headers = {} } = {}) {
  const url = `${apiOrigin(request)}/api${path}`;
  const init = {
    method,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cartToken ? { 'x-cart-token': cartToken } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  const inProcess = globalThis.__velaApiFetch;
  const res = inProcess
    ? await inProcess(new Request(url, init))
    : await fetch(url, init);

  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { ok: res.ok, status: res.status, data: json };
}

export const SESSION_COOKIE = 'vela_session';
export const CART_COOKIE = 'vela_cart';
export const ORDER_TOKEN_COOKIE = 'vela_order_tokens';

export function readSession(Astro) {
  return Astro.cookies.get(SESSION_COOKIE)?.value || null;
}

export function readCartToken(Astro) {
  return Astro.cookies.get(CART_COOKIE)?.value || null;
}

/** Access tokens for guest orders, so a visitor can return to /orders/<number>. */
export function readOrderTokens(Astro) {
  try {
    const raw = Astro.cookies.get(ORDER_TOKEN_COOKIE)?.value;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function formatMinor(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  return `${neg ? '-' : ''}$${Math.trunc(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  return `${(n / 1_000_000).toFixed(1)} MB`;
}

export function formatDate(value) {
  if (!value) return '';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`)
    : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

const MEDIA_BY_SKU = {
  'VELA-A1-GRAPHITE': '/media/flagship.jpg',
  'VELA-A1-SAND': '/media/flagship-sand.jpg',
  'VELA-A1-YELLOW': '/media/flagship-yellow.jpg',
  'VELA-CRICKET-GRAPHITE': '/media/compact.jpg',
  'VELA-CRICKET-YELLOW': '/media/compact-yellow.jpg',
  'VELA-CASE-STD': '/media/case.jpg',
  'VELA-CABLE-1M': '/media/cable.jpg',
  'VELA-CABLE-2M': '/media/cable.jpg',
  'VELA-MOUNT-CLAMP': '/media/mount.jpg',
  'VELA-MOUNT-VESA': '/media/mount.jpg',
};

const MEDIA_BY_HANDLE = {
  flagship: '/media/flagship.jpg',
  compact: '/media/compact.jpg',
  case: '/media/case.jpg',
  cable: '/media/cable.jpg',
  mount: '/media/mount.jpg',
};

export function mediaFor(handle, sku) {
  return (sku && MEDIA_BY_SKU[sku]) || MEDIA_BY_HANDLE[handle] || '/media/compact.jpg';
}
