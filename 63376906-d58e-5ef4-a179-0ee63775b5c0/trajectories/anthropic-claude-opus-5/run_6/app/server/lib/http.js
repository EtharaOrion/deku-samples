import crypto from 'node:crypto';
import { q, pool } from './db.js';
import { verifyAppToken, bearerFrom, actorCan } from './auth.js';
import { appendEntry } from './records.js';

export class Refusal extends Error {
  constructor(status, code, body) {
    super(code);
    this.status = status;
    this.code = code;
    this.body = body || {};
  }
}

export function refuse(status, code, body) {
  throw new Refusal(status, code, body);
}

// The app never accepts an identity a caller asserts.
export async function requireSession(c) {
  const token = bearerFrom(c);
  if (!token) refuse(401, 'no_session', { error: 'no_session', message: 'This route requires a session.' });
  const payload = await verifyAppToken(token);
  if (!payload) refuse(401, 'invalid_session', { error: 'invalid_session', message: 'The session is not valid or has expired.' });
  return payload;
}

export async function requireAct(c, act) {
  const actor = await requireSession(c);
  if (!actorCan(actor, act)) {
    await appendEntry(null, {
      person: actor.email, site: null, object_kind: 'authorization', object_ref: act,
      action: 'refused', content: { act, roles: actor.roles, route: c.req.path, reason: 'role_not_entitled' },
    });
    refuse(403, 'not_entitled', {
      error: 'not_entitled',
      message: `This act requires an entitlement your roles do not carry.`,
      act,
      roles: actor.roles,
    });
  }
  return actor;
}

export function bodyHash(body) {
  return crypto.createHash('sha256').update(JSON.stringify(sortDeep(body ?? null))).digest('hex');
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}

// An Idempotency-Key is scoped to the route it was sent to and to the body it was
// sent with. A write with no key at all is refused, so a retry can never be
// indistinguishable from a second act.
export async function withIdempotency(c, body, handler) {
  const key = c.req.header('idempotency-key');
  const route = `${c.req.method} ${routeKey(c)}`;
  if (!key) {
    refuse(400, 'idempotency_key_required', {
      error: 'idempotency_key_required',
      message: 'Every write carries an Idempotency-Key header, so a retry is never a second act.',
    });
  }
  const hash = bodyHash(body);
  const existing = (await q('SELECT * FROM idempotency WHERE key = $1 AND route = $2', [key, route]))[0];
  if (existing) {
    if (existing.body_hash !== hash) {
      refuse(409, 'idempotency_key_reuse', {
        error: 'idempotency_key_reuse',
        message: 'A key is a promise about one act, not a licence to replace it. This key was used on this route with a different body.',
        key,
      });
    }
    return { status: existing.status, body: existing.response, replayed: true };
  }
  const result = await handler();
  await pool.query(
    'INSERT INTO idempotency (key, route, body_hash, status, response) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (key, route) DO NOTHING',
    [key, route, hash, result.status || 201, result.body]
  );
  return { status: result.status || 201, body: result.body, replayed: false };
}

function routeKey(c) {
  return c.req.routePath || c.req.path;
}

// Four answers are complete sets by contract, and each refuses a page parameter
// rather than honouring it or ignoring it.
export function refusePagination(c) {
  const url = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (url.searchParams.has(p)) {
      refuse(400, 'complete_set_only', {
        error: 'complete_set_only',
        message: 'This answer is a complete set by contract. A caller handed a page resolves a page and believes the work is finished.',
        parameter: p,
      });
    }
  }
}

// No route accepts a percentage, a carbon value or a loss figure from a caller.
const FORBIDDEN_INPUT = [
  'content_bp', 'recycled_content_bp', 'percentage', 'percent', 'recycled_content',
  'value_mg_per_kg', 'carbon_mg_per_kg', 'carbon_value', 'emissions_mg_per_kg',
  'losses_g', 'loss_g', 'yield_bp', 'yield',
];

export function rejectComputedInputs(body) {
  const found = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (FORBIDDEN_INPUT.includes(k)) found.push(path ? `${path}.${k}` : k);
        walk(v[k], path ? `${path}.${k}` : k);
      }
    }
  };
  walk(body, '');
  if (found.length) {
    refuse(400, 'computed_figure_not_accepted', {
      error: 'computed_figure_not_accepted',
      message: 'Every percentage, carbon value and loss figure is computed. No route accepts one.',
      fields: found,
    });
  }
}

// No figure crosses the wire as a decimal and no route accepts one.
export function requireIntegers(body, fields) {
  for (const f of fields) {
    const v = body?.[f];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      refuse(400, 'integer_required', {
        error: 'integer_required',
        message: 'No figure crosses the wire as a decimal. Masses are integer grams and proportions are integer basis points.',
        field: f,
        received: v,
      });
    }
  }
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body?.[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) {
    refuse(400, 'missing_fields', {
      error: 'missing_fields',
      message: `These fields are required and have no default: ${missing.join(', ')}.`,
      fields: missing,
    });
  }
}

export async function nextReference(prefix, table, column = 'reference') {
  const rows = await q(
    `SELECT ${column} AS ref FROM ${table} WHERE ${column} LIKE $1 ORDER BY ${column} DESC LIMIT 1`,
    [`${prefix}-%`]
  );
  const last = rows[0]?.ref;
  const n = last ? Number(String(last).split('-').pop()) : 0;
  return `${prefix}-${String((Number.isFinite(n) ? n : 0) + 1).padStart(4, '0')}`;
}

export function nowIso() { return new Date().toISOString(); }
export function today() { return new Date().toISOString().slice(0, 10); }
