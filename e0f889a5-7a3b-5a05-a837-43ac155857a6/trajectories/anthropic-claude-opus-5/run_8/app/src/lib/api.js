// Server-side calls from an Astro route into the app's own HTTP API on the same
// origin. Every route is server-rendered from the real API, never from a fixture.
import apiApp from '../../server/api.js';

export async function apiFetch(astro, path, init = {}) {
  const url = new URL(astro.request.url);
  const target = new URL(path, url.origin);
  const headers = new Headers(init.headers || {});
  const cookie = astro.request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  headers.set('x-request-id', astro.locals?.requestId || 'ssr');

  const req = new Request(target, { ...init, headers });
  const res = await apiApp.fetch(req);

  // Any Set-Cookie the API issued (a new cart, a new session) must reach the
  // browser. It goes through Astro.cookies, because Astro.redirect builds a
  // fresh Response and would otherwise drop a header set on Astro.response.
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const sc of setCookies) {
    if (astro.cookies) applyCookie(astro.cookies, sc);
    else astro.response?.headers?.append('set-cookie', sc);
  }

  let json = null;
  const text = await res.text();
  if (text) { try { json = JSON.parse(text); } catch { json = null; } }
  return { status: res.status, ok: res.ok, data: json, setCookies };
}

// Parse one Set-Cookie header and hand it to Astro's cookie store, so it is
// written onto whatever response the route finally returns.
function applyCookie(cookies, header) {
  const parts = String(header).split(';');
  const [name, ...valueParts] = parts[0].split('=');
  const value = valueParts.join('=');
  const opts = { path: '/' };
  for (const p of parts.slice(1)) {
    const [rawK, ...rawV] = p.trim().split('=');
    const k = rawK.toLowerCase();
    const v = rawV.join('=');
    if (k === 'path') opts.path = v;
    else if (k === 'max-age') opts.maxAge = Number(v);
    else if (k === 'expires') opts.expires = new Date(v);
    else if (k === 'samesite') opts.sameSite = v.toLowerCase();
    else if (k === 'httponly') opts.httpOnly = true;
    else if (k === 'secure') opts.secure = true;
    else if (k === 'domain') opts.domain = v;
  }
  cookies.set(name.trim(), decodeURIComponent(value), opts);
}

export async function getJSON(astro, path) {
  const r = await apiFetch(astro, path);
  return r;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
