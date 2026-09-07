/**
 * Server-side data access for the rendered pages.
 *
 * Astro renders on the same origin as the API, so a page fetch carries the
 * caller's own cookies through to the API and the markup is complete on first
 * paint rather than filled in by the browser.
 */

function originFrom(request) {
  try {
    const url = new URL(request.url);
    if (url.protocol && url.host) return `${url.protocol}//${url.host}`;
  } catch { /* fall through */ }
  return 'http://127.0.0.1';
}

/**
 * The API is dispatched in process rather than over a second socket. The server
 * publishes the Hono app on globalThis at boot, so a page render is one call
 * into the same handler a browser would reach, carrying the same cookies and
 * producing the same JSON, with no network hop and no port to guess.
 */
export async function apiFetch(request, path, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  if (!headers.has('accept')) headers.set('accept', 'application/json');

  const url = `${originFrom(request)}${path}`;
  const proxied = new Request(url, { ...init, headers });

  const api = globalThis.__velaApi;
  const res = api ? await api.fetch(proxied) : await fetch(proxied);

  const text = await res.text();
  let json = null;
  if (text) { try { json = JSON.parse(text); } catch { json = null; } }
  return { ok: res.ok, status: res.status, data: json, headers: res.headers };
}

/** A read that renders an empty or failed state rather than blanking the page. */
export async function safeGet(request, path, fallback = null) {
  try {
    const res = await apiFetch(request, path);
    if (!res.ok) return { data: fallback, failed: true, status: res.status, error: res.data, headers: res.headers };
    return { data: res.data, failed: false, status: res.status, headers: res.headers };
  } catch (err) {
    return { data: fallback, failed: true, status: 0, error: { message: err.message } };
  }
}

/** Pass a cookie the API issued during a render on to the browser. */
export function forwardCookies(Astro, apiHeaders) {
  const cookies = apiHeaders?.getSetCookie?.() ?? [];
  for (const cookie of cookies) Astro.response.headers.append('set-cookie', cookie);
  if (!cookies.length) {
    const single = apiHeaders?.get?.('set-cookie');
    if (single) Astro.response.headers.append('set-cookie', single);
  }
}

/**
 * A redirect that carries the session cookie the API just issued.
 *
 * `Astro.redirect` builds its own response, so cookies set on `Astro.response`
 * are lost with it. Building the response here keeps the Set-Cookie and the
 * Location together, which is what signing in needs.
 */
export function redirectWithCookies(location, apiHeaders, status = 303) {
  const headers = new Headers({ Location: location });
  const cookies = apiHeaders?.getSetCookie?.() ?? [];
  for (const cookie of cookies) headers.append('set-cookie', cookie);
  if (!cookies.length) {
    const single = apiHeaders?.get?.('set-cookie');
    if (single) headers.append('set-cookie', single);
  }
  return new Response(null, { status, headers });
}

export async function currentCustomer(request) {
  const res = await safeGet(request, '/api/auth/me');
  return res.failed ? null : (res.data?.customer ?? null);
}

export function cartTokenFromRequest(request) {
  const cookie = request.headers.get('cookie') || '';
  const m = /(?:^|;\s*)vela_cart=([^;]+)/.exec(cookie);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Reads the cart without creating one, so a bare page view leaves no rows. */
export async function readCartForPage(request) {
  if (!cartTokenFromRequest(request)) {
    return { lines: [], item_count: 0, subtotal_minor: 0, notices: [], total_minor: 0, tax_minor: 0, shipping_minor: 0, protection_enabled: false, protection_rung: null };
  }
  const res = await safeGet(request, '/api/cart');
  return res.data ?? { lines: [], item_count: 0, subtotal_minor: 0, notices: [] };
}
