export function getToken() {
  return localStorage.getItem('ravel_token');
}
export function setToken(t) {
  if (t) localStorage.setItem('ravel_token', t);
  else localStorage.removeItem('ravel_token');
}
export async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && typeof opts.body !== 'string') {
    opts = { ...opts, body: JSON.stringify(opts.body) };
    headers['content-type'] = 'application/json';
  }
  const token = getToken();
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(path, { ...opts, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}
