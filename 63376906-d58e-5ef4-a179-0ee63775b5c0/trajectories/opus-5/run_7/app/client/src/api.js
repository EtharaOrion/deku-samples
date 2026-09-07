// One origin. The client computes no figure of its own; every number it renders
// came from the engine with its derivation attached.

const TOKEN_KEY = 'ravel.session';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

let keyCounter = 0;
export function idempotencyKey() {
  const rand = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return `${rand}-${keyCounter++}`;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || body?.message || `Request failed with ${status}`);
    this.status = status;
    this.body = body || {};
  }
}

async function request(method, path, { body, idem } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['Idempotency-Key'] = idem || idempotencyKey();
  const res = await fetch(`/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { _raw: text }; }
  if (!res.ok) throw new ApiError(res.status, payload);
  return payload;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, body, idem) => request('POST', p, { body, idem }),
  patch: (p, body, idem) => request('PATCH', p, { body, idem }),
  del: (p) => request('DELETE', p),
  text: async (p) => {
    const token = getToken();
    const res = await fetch(`/api${p}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return res.text();
  }
};

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  setToken(body.access_token);
  return body;
}

export function logout() { setToken(null); currentSession = null; }

/**
 * The session the console is rendering for. Authorization is decided on the server for
 * every mutating route; this only decides whether a control is worth offering, so that an
 * auditor is not shown a button that would be refused.
 */
let currentSession = null;
export function setSession(s) { currentSession = s; }
export function getSession() { return currentSession; }
export function holdsRole(...roles) {
  if (!currentSession) return false;
  return roles.some((r) => (currentSession.roles || []).includes(r));
}
