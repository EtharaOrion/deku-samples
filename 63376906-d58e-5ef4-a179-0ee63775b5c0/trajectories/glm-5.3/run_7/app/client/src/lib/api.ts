// The client's one way of talking to the API. Every write carries an
// Idempotency-Key; no figure is ever computed on a screen.
const TOKEN_KEY = 'ravel.token';

export function token(): string | null {
  return window.sessionStorage.getItem(TOKEN_KEY) || window.localStorage.getItem(TOKEN_KEY);
}

export function storeToken(t: string) {
  window.localStorage.setItem(TOKEN_KEY, t);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.message || body?.error || `request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

function idemKey(): string {
  if (!window.crypto?.randomUUID) {
    return 'idem-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  return window.crypto.randomUUID();
}

export async function api<T = any>(path: string, options: { method?: string; body?: any; public?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const t = token();
  if (t && !options.public) headers['authorization'] = 'Bearer ' + t;
  const method = options.method || 'GET';
  if (method !== 'GET') headers['idempotency-key'] = idemKey();
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  let data: any = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export function rawText(path: string): Promise<string> {
  const t = token();
  return fetch('/api' + path, { headers: t ? { authorization: 'Bearer ' + t } : {} }).then((r) => r.text());
}

export type Me = { email: string; name: string; role: string; roles: string[]; sites: string[]; grant_ends_on: string };

export async function me(): Promise<Me | null> {
  const t = token();
  if (!t) return null;
  try {
    const m = await api<any>('/auth/me');
    return { ...m, role: m.roles?.[0] || m.role };
  } catch (e: any) {
    if (e.status === 401) { clearToken(); return null; }
    throw e;
  }
}

export async function login(email: string, password: string) {
  const res = await api<{ access_token: string }>('/auth/login', { method: 'POST', body: { email, password }, public: true });
  storeToken(res.access_token);
  return res;
}

export function pct(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, '') + '%';
}

export function g(n: number): string {
  return Number(n).toLocaleString('en-GB') + ' g';
}

export function kg(n: number): string {
  return Number(n).toLocaleString('en-GB') + ' kg';
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return String(d).slice(0, 10);
}
