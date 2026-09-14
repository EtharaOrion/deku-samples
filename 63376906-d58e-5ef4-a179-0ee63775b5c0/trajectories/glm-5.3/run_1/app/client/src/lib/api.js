const TOKEN_KEY = 'ravel_session';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

let idemCounter = 0;
const newKey = () => 'ui-' + Date.now().toString(36) + '-' + (++idemCounter).toString(36);

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['Idempotency-Key'] = newKey();
  const res = await fetch('/api' + path, {
    method, headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': newKey() },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.access_token) { setToken(data.access_token); return { ok: true }; }
  return { ok: false, error: data.error || 'invalid_credentials' };
}

export const fmt = {
  g: (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('en-GB') + ' g',
  kg: (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('en-GB') + ' kg',
  bp: (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('en-GB') + ' bp',
  mg: (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('en-GB') + ' mg CO₂e/kg',
  kwh: (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString('en-GB') + ' kWh',
  date: (d) => d ? String(d).slice(0, 10) : '—'
};
