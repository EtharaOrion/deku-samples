// Server-side authorisation, idempotency, rate limiting and the sessions the app issues itself.
import type { Context, Next } from 'hono';
import { createHash } from 'node:crypto';
import { db } from './dbindex.ts';

export type Session = { email: string; name: string; role: string; sites: string[]; ends_on: string };

export function deny(code: string, message: string, status = 403): never {
  throw Object.assign(new Error(message), { status, code });
}

export function bearer(c: Context): string | null {
  const h = c.req.header('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

export async function sessionFrom(c: Context): Promise<Session | null> {
  const token = bearer(c);
  if (!token) return null;
  const r = await db.query('SELECT * FROM sessions WHERE token=$1 AND expires_at > now()', [token]);
  const s = r.rows[0];
  if (!s) return null;
  const g = (await db.query('SELECT * FROM grants WHERE email=$1', [s.email])).rows[0];
  if (!g) return null;
  if (g.ends_on < new Date().toISOString().slice(0, 10)) return null;
  return { email: g.email, name: g.name, role: g.role, sites: g.sites, ends_on: g.ends_on };
}

export async function requireSession(c: Context): Promise<Session> {
  const s = await sessionFrom(c);
  if (!s) deny('session_required', 'A session is required.', 401);
  return s!;
}

const READ_ROLES = ['plant_operator', 'lab_analyst', 'quality_manager', 'claims_manager', 'certificate_signer', 'auditor'];

export async function requireRole(c: Context, roles: string[]): Promise<Session> {
  const s = await requireSession(c);
  if (!roles.includes(s.role)) deny('role_not_permitted', `This act requires one of: ${roles.join(', ')}.`, 403);
  return s;
}

export async function requireSite(c: Context, site: string): Promise<Session> {
  const s = await requireSession(c);
  if (!s.sites.includes(site)) deny('site_out_of_scope', `Your grant does not cover ${site}.`, 403);
  return s;
}

export async function requireWriteSession(c: Context): Promise<Session> {
  const s = await requireSession(c);
  if (s.role === 'auditor') deny('auditor_is_read_only', 'An auditor writes no operational record, at any route.', 403);
  return s;
}

export async function requireRead(c: Context): Promise<Session> {
  const s = await requireSession(c);
  if (!READ_ROLES.includes(s.role)) deny('role_not_permitted', 'No read grant for this role.', 403);
  return s;
}

export function noPaginationShared(c: Context) {
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (c.req.query(p) !== undefined) deny('pagination_refused', `This route returns a complete set; ${p} is not accepted.`, 400);
  }
}

// ---- idempotency ---------------------------------------------------------

export function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

export async function idempotent(c: Context, next: Next) {
  const key = c.req.header('idempotency-key');
  const method = c.req.method;
  const route = c.req.path;
  const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  if (!isWrite) return next();
  if (!key) {
    return c.json({ error: 'idempotency_key_required', message: 'Every write carries a client-supplied Idempotency-Key header.' }, 400);
  }

  const raw = await c.req.raw.clone().text();
  const bodyHash = hashBody(raw);

  const existing = await db.query('SELECT * FROM idempotency_keys WHERE key=$1 AND route=$2', [key, route]);
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (row.body_hash !== bodyHash) {
      return c.json({ error: 'idempotency_key_reuse', message: 'This key was sent to this route with a different body.' }, 409);
    }
    return c.json(row.response, row.status);
  }

  await next();

  // Whatever the route answered becomes the remembered answer for this key, so
  // a retry replays it and creates nothing further — a refusal included.
  const res = c.res;
  if (res) {
    const status = res.status;
    let body: any = null;
    try {
      const text = await res.clone().text();
      body = text ? JSON.parse(text) : null;
    } catch {
      return;
    }
    await db.query(
      `INSERT INTO idempotency_keys (key,route,body_hash,status,response) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key,route) DO NOTHING`,
      [key, route, bodyHash, status, JSON.stringify(body)]
    );
  }
}

export async function rememberIdempotent(c: Context, status: number, body: unknown) {
  const key = c.get('idemKey');
  if (!key) return;
  await db.query(
    `INSERT INTO idempotency_keys (key,route,body_hash,status,response) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (key,route) DO NOTHING`,
    [key, c.req.path, c.get('idemBodyHash'), status, JSON.stringify(body)]
  );
}

// ---- rate limiting ------------------------------------------------------

export async function rateLimit(c: Context, bucket: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const r = await db.query(
    `INSERT INTO rate_limits (bucket, window_start, count) VALUES ($1,$2,1)
     ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1 RETURNING count`,
    [bucket, windowStart.toISOString()]
  );
  return Number(r.rows[0].count) <= limit;
}

// ---- body parsing -------------------------------------------------------

export async function readJson(c: Context): Promise<any> {
  try {
    return await c.req.json();
  } catch {
    deny('invalid_json', 'The body is not valid JSON.', 400);
  }
}

export function requireFields(body: any, fields: string[]) {
  const missing = fields.filter((f) => body?.[f] === undefined || body?.[f] === null || body?.[f] === '');
  if (missing.length) deny('missing_fields', `Required: ${missing.join(', ')}.`, 400);
}

export function requireInteger(body: any, field: string) {
  const v = body?.[field];
  if (!Number.isInteger(v)) deny('invalid_integer', `${field} must be an integer.`, 400);
}

export function requireNoDecimal(body: any, field: string) {
  const v = body?.[field];
  if (v !== undefined && v !== null && !Number.isInteger(v)) deny('no_decimals', `${field} must be an integer; no decimal crosses the wire.`, 400);
}
