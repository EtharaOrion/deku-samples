const TOKEN_KEY = 'ravel.token';
const SESSION_KEY = 'ravel.session';

export function token() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function storedSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}

export function setSession(tok, session) {
  localStorage.setItem(TOKEN_KEY, tok);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function idempotencyKey() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  return 'k-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const t = token();
  if (t) headers.authorization = 'Bearer ' + t;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.method && options.method !== 'GET' && !headers['idempotency-key']) {
    headers['idempotency-key'] = idempotencyKey();
  }
  const res = await fetch('/api' + path, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!res.ok) {
    const err = new Error((payload && payload.detail) || 'The request was refused.');
    err.status = res.status;
    err.body = payload;
    throw err;
  }
  return payload;
}

export async function apiText(path) {
  const headers = {};
  const t = token();
  if (t) headers.authorization = 'Bearer ' + t;
  const res = await fetch('/api' + path, { headers });
  if (!res.ok) {
    const err = new Error('The request was refused.');
    err.status = res.status;
    throw err;
  }
  return res.text();
}

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload = await res.json();
  if (!res.ok) {
    const err = new Error(payload.detail || 'The email and password were not accepted.');
    err.body = payload;
    throw err;
  }
  localStorage.setItem(TOKEN_KEY, payload.access_token);
  const me = await api('/auth/me');
  localStorage.setItem(SESSION_KEY, JSON.stringify(me));
  return me;
}
