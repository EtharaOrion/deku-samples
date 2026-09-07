// One origin: the API is served under /api beside the client.
const TOKEN_KEY = 'ravel.token';
const USER_KEY = 'ravel.user';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

let keyCounter = 0;
function idempotencyKey() {
  keyCounter += 1;
  const rand = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  return `ui-${rand}-${keyCounter}`;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error || `Request failed with ${status}`);
    this.status = status;
    this.body = body || {};
    this.code = body?.error;
  }
}

async function request(method, path, { body, key } = {}) {
  const headers = { 'content-type': 'application/json' };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  // a write that arrives with no key at all is refused, so the client always sends one
  if (method !== 'GET') headers['idempotency-key'] = key || idempotencyKey();
  const res = await fetch(`/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body, key) => request('POST', path, { body, key }),
  patch: (path, body, key) => request('PATCH', path, { body, key }),
  del: (path, key) => request('DELETE', path, { key }),
  text: async (path) => {
    const headers = {};
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`/api${path}`, { headers });
    if (!res.ok) throw new ApiError(res.status, { message: 'The document could not be read.' });
    return res.text();
  },
};

export async function login(email, password) {
  const out = await request('POST', '/auth/login', { body: { email, password } });
  setSession(out.access_token, { email: out.email, name: out.name, roles: out.roles, sites: out.sites });
  return out;
}
