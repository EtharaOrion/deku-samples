const TOKEN_KEY = 'ravel_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (getToken()) headers.authorization = `Bearer ${getToken()}`;
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['content-type'] = 'application/json';
    opts = { ...opts, body: JSON.stringify(opts.body) };
  }
  const r = await fetch(path, { ...opts, headers });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}
export async function login(email, password) {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const data = await r.json().catch(() => null);
  if (r.ok && data?.access_token) { setToken(data.access_token); return { ok: true }; }
  return { ok: false, error: data?.error || 'invalid_credentials' };
}
export const uid = () => 'k-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
