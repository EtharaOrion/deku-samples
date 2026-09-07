import { c as api } from './app_BbZzWQ31.mjs';

/**
 * Pages are server-rendered against the same Hono app that serves /api, in the
 * same process. The browser receives readable, complete markup on first paint
 * on every route; no page waits on a client fetch for its content.
 */
async function apiGet(path, Astro, init = {}) {
  const url = new URL(path, Astro.url.origin);
  const headers = new Headers(init.headers || {});
  const cookie = Astro.request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  const auth = Astro.request.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  const res = await api.fetch(new Request(url, {
    ...init,
    headers
  }));
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return {
    ok: res.ok,
    status: res.status,
    body,
    headers: res.headers
  };
}

/** The signed-in customer for a page render, or null. */
async function pageCustomer(Astro) {
  const {
    ok,
    body
  } = await apiGet('/api/auth/me', Astro);
  return ok ? body.customer : null;
}

/** The cart for a page render. Never creates one for a plain read. */
async function pageCart(Astro) {
  const {
    ok,
    body,
    headers
  } = await apiGet('/api/cart', Astro);
  if (!ok) return null;
  // Carry a newly minted cart cookie out to the browser.
  const setCookie = headers.get('set-cookie');
  if (setCookie) Astro.response.headers.append('set-cookie', setCookie);
  return body.cart;
}

export { pageCart as a, apiGet as b, pageCustomer as p };
