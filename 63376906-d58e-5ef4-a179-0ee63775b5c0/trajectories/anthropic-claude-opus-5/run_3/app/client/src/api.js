/** The client reads the API and computes nothing of its own. Every figure it
 *  renders came from the engine with its derivation attached. */

const TOKEN_KEY = 'ravel.session';

export function storedSession() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function storeSession(s) {
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}

export function clearSession() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

/** Every write carries a client-supplied Idempotency-Key, so a retry can never
 *  be indistinguishable from a second act. */
export function newKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.detail || body?.error || `request failed with ${status}`);
    this.status = status;
    this.body = body || { error: 'unknown', detail: 'The request could not be completed.' };
  }
}

export async function api(path, { method = 'GET', body, key, signal } = {}) {
  const headers = {};
  const session = storedSession();
  if (session?.access_token) headers.authorization = `Bearer ${session.access_token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (method !== 'GET') headers['idempotency-key'] = key || newKey();

  const res = await fetch(`/api${path}`, {
    method, headers, signal,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    if (res.status === 401 && session) clearSession();
    throw new ApiError(res.status, data);
  }
  return data;
}

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  storeSession(data);
  return data;
}
