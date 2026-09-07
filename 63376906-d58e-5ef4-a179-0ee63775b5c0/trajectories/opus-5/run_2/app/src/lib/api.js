const TOKEN_KEY = 'ravel.token';
const USER_KEY = 'ravel.user';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const getUser = () => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
};
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `request failed with ${status}`);
    this.status = status;
    this.body = body || {};
    this.rule = body?.rule || body?.error || null;
  }
}

let keyCounter = 0;
export function idempotencyKey(prefix = 'ui') {
  keyCounter += 1;
  const rand = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random()).slice(2);
  return `${prefix}-${rand}-${keyCounter}`;
}

export async function api(path, { method = 'GET', body, key, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    // Every write carries a client-supplied Idempotency-Key.
    headers['idempotency-key'] = key || idempotencyKey();
  }
  const res = await fetch(`/api${path}`, {
    method, headers, signal,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed;
}

export async function login(email, password) {
  const r = await api('/auth/login', {
    method: 'POST', body: { email, password }, key: idempotencyKey('login'),
  });
  setSession(r.access_token, { email: r.email, roles: r.roles, sites: r.sites, name: r.name });
  return r;
}
