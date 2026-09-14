let token = null;
let me = null;

export function setToken(t) { token = t; try { localStorage.setItem('ravel_token', t); } catch {} }
export function getStoredToken() {
  if (token) return token;
  try { token = localStorage.getItem('ravel_token'); } catch {}
  return token;
}
export function clearToken() { token = null; me = null; try { localStorage.removeItem('ravel_token'); } catch {} }

export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && typeof opts.body !== 'string') {
    opts = { ...opts, body: JSON.stringify(opts.body) };
    headers['content-type'] = 'application/json';
  }
  const t = getStoredToken();
  if (t) headers['authorization'] = `Bearer ${t}`;
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  const res = await fetch(path, { ...opts, headers });
  let body = null;
  const text = await res.text();
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (res.status === 401 && !path.includes('/api/auth/')) {
    clearToken();
  }
  return { ok: res.ok, status: res.status, body };
}

export async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  if (r.ok && r.body && r.body.access_token) {
    setToken(r.body.access_token);
    me = null;
    return true;
  }
  return false;
}

export async function meNow() {
  if (me) return me;
  const t = getStoredToken();
  if (!t) return null;
  const r = await api('/api/auth/me');
  if (r.ok) { me = r.body; return me; }
  return null;
}

export function currentMe() { return me; }
export function setMe(m) { me = m; }
export function logout() { clearToken(); }
