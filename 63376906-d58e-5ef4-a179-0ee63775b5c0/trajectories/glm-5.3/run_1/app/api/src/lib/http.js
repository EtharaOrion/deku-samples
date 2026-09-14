import { createHash } from 'node:crypto';
import { one } from '../db.js';

export class ApiError extends Error {
  constructor(status, body) { super(typeof body === 'string' ? body : (body?.error || 'error')); this.status = status; this.body = body; }
}
export const err = (status, error, extra = {}) => new ApiError(status, { error, ...extra });
export const conflict = (error, extra = {}) => new ApiError(409, { error, ...extra });
export const bad = (error, extra = {}) => new ApiError(400, { error, ...extra });
export const forbidden = (error, extra = {}) => new ApiError(403, { error, ...extra });
export const notFound = (error, extra = {}) => new ApiError(404, { error, ...extra });

export const intField = (v, name) => {
  if (v === undefined || v === null) throw bad('missing_field', { field: name });
  if (typeof v !== 'number' || !Number.isInteger(v)) throw bad('not_an_integer', { field: name });
  return v;
};
export const reqField = (v, name) => {
  if (v === undefined || v === null || v === '') throw bad('missing_field', { field: name });
  return v;
};
export const enumField = (v, name, values) => {
  reqField(v, name);
  if (!values.includes(v)) throw bad('invalid_value', { field: name, allowed: values });
  return v;
};

export const hashBody = (b) => createHash('sha256').update(b || '').digest('hex');

// A complete set is a contract: page/limit/offset/cursor are refused, not honoured, not ignored.
export const refusePagination = (c) => {
  const u = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (u.searchParams.has(p)) throw bad('pagination_refused', { parameter: p, reason: 'complete_set_by_contract' });
  }
};

// Idempotency, precisely: scoped to route and body. A write with no key is refused.
export async function idempotency(c, next) {
  const method = c.req.method;
  if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT' && method !== 'DELETE') return next();
  const key = c.req.header('idempotency-key');
  if (!key) throw err(400, 'idempotency_key_required', { hint: 'a retry must never be indistinguishable from a second act' });
  const body = await c.req.raw.clone().text();
  const h = hashBody(body);
  const existing = await one('SELECT body_hash, response FROM idempotency_keys WHERE key = $1 AND route = $2', [key, c.req.path]);
  if (existing) {
    if (existing.body_hash !== h) {
      throw conflict('idempotency_key_reuse', { key, route: c.req.path, reason: 'a key is a promise about one act, not a licence to replace it' });
    }
    const stored = existing.response || {};
    return c.json(stored.body !== undefined ? stored.body : stored, stored.status || 200);
  }
  await next();
  try {
    const status = c.res.status;
    let parsed = null;
    try { parsed = await c.res.clone().json(); } catch { parsed = null; }
    await one('INSERT INTO idempotency_keys (key, route, body_hash, response) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [key, c.req.path, h, JSON.stringify({ status, body: parsed })]);
  } catch { /* storage failure never blocks the act */ }
}

// Retained for compatibility; the middleware now records the response itself.
export async function rememberIdempotency() {}

// Sessions: the app's own bearer token. Nothing trusts an asserted identity.
export async function currentUser(c) {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const s = await one('SELECT s.token, s.expires_at, u.email, u.name, u.role, u.sites, u.grant_ends_on FROM sessions s JOIN users u ON u.email = s.email WHERE s.token = $1', [m[1].trim()]);
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) return null;
  if (new Date(s.grant_ends_on) < new Date(new Date().toISOString().slice(0, 10))) return { ...s, expired: true };
  return { ...s, token: s.token };
}

export async function requireAuth(c) {
  const u = await currentUser(c);
  if (!u) throw err(401, 'authentication_required');
  if (u.expired) throw err(403, 'grant_expired');
  c.set('user', u);
  return u;
}

export async function requireRole(c, ...roles) {
  const u = await requireAuth(c);
  if (!roles.includes(u.role)) throw forbidden('role_not_permitted', { role: u.role, requires: roles });
  return u;
}

export async function requireSite(c, site) {
  const u = await requireAuth(c);
  if (!u.sites.includes(site)) throw forbidden('site_out_of_scope', { site, scope: u.sites });
  return u;
}

export const isNumericId = (s) => /^\d+$/.test(String(s));
export const today = () => new Date(new Date().toISOString().slice(0, 10));
export const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d));
