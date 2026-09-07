/** The client reads the engine. It computes no figure of its own. */

const TOKEN_KEY = 'ravel.session';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
}

export function idempotencyKey() {
  return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
}

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.authorization = 'Bearer ' + token;
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    headers['idempotency-key'] = opts.key || idempotencyKey();
  }
  const res = await fetch('/api' + path, {
    method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || (data && data.error) || res.statusText);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

export async function login(email, password) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password } });
  setToken(r.access_token);
  return r;
}

export function logout() { setToken(null); }
