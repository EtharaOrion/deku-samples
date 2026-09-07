import { createHash } from 'node:crypto';
import { verifyAppToken } from './auth.js';
import { pool, tx } from '../db.js';
import { appendEntry } from './record.js';

export class Refusal extends Error {
  constructor(status, body) {
    super(body && body.error ? body.error : 'refused');
    this.status = status;
    this.body = body;
  }
}

export function refuse(status, error, detail, extra = {}) {
  return new Refusal(status, { error, detail, ...extra });
}

export function session(c) {
  const header = c.req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  return verifyAppToken(token);
}

// Authorization is decided on the server for every mutating route.
export function requireSession(c) {
  const s = session(c);
  if (!s) throw refuse(401, 'no_session', 'This route requires a session.');
  return s;
}

export function requireRole(c, ...roles) {
  const s = requireSession(c);
  const held = s.roles || [];
  if (!roles.some((r) => held.includes(r))) {
    throw refuse(403, 'role_not_held', `This act requires one of: ${roles.join(', ')}.`, {
      required_roles: roles,
      held_roles: held,
    });
  }
  return s;
}

// An auditor writes no operational record, at any route.
export function refuseAuditorWrite(s) {
  if ((s.roles || []).includes('auditor')) {
    throw refuse(403, 'auditor_writes_nothing', 'An auditor reads, exports and annotates, and writes no operational record.');
  }
}

export function bodyDigest(body) {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

// A complete set by contract refuses a page, a limit, an offset or a cursor.
export function refusePagination(c) {
  const url = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (url.searchParams.has(p)) {
      throw refuse(400, 'pagination_refused',
        'This answer is a complete set by contract and is never paginated.', { parameter: p });
    }
  }
}

// An Idempotency-Key is scoped to the route it was sent to and to the body it was sent with.
export async function withIdempotency(c, routeKey, body, handler) {
  const key = c.req.header('idempotency-key');
  if (!key) {
    throw refuse(400, 'idempotency_key_required',
      'Every write carries an Idempotency-Key header, so a retry can never be indistinguishable from a second act.');
  }
  const digest = bodyDigest(body);
  const existing = await pool.query(
    'SELECT * FROM idempotency_key WHERE key = $1 AND route = $2',
    [key, routeKey]
  );
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (row.body_digest !== digest) {
      throw refuse(409, 'idempotency_key_reuse',
        'A key is a promise about one act, not a licence to replace it. This key was used with a different body.');
    }
    return c.json(row.response, row.status);
  }
  const result = await handler();
  const status = result.status || 200;
  try {
    await pool.query(
      `INSERT INTO idempotency_key (key, route, body_digest, status, response)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key, route) DO NOTHING`,
      [key, routeKey, digest, status, JSON.stringify(result.body)]
    );
  } catch { /* a concurrent retry stored it first; the stored answer stands */ }
  return c.json(result.body, status);
}

// A refusal is recorded as well as a success.
export async function recordRefusal(entry) {
  try {
    await tx((client) => appendEntry(client, { ...entry, outcome: 'refused' }));
  } catch { /* the refusal answer must not depend on the record write */ }
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

export function dateOnly(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export function momentISO(v) {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
