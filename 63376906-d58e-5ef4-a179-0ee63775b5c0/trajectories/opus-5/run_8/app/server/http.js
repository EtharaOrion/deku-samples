import { one, query } from './db.js';
import { appendEntry } from './record.js';
import { bodyHash, hasRole, readAppToken } from './auth.js';

export class Refusal extends Error {
  constructor(status, body) {
    super(body?.error || 'refused');
    this.status = status;
    this.body = body;
  }
}

export const refuse = (status, error, extra = {}) => {
  throw new Refusal(status, { error, ...extra });
};

export async function sessionFrom(c) {
  const header = c.req.header('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const payload = await readAppToken(header.slice(7).trim());
  if (!payload) return null;
  return {
    email: payload.email,
    name: payload.name,
    roles: payload.roles || [],
    sites: payload.sites || [],
    identifier: payload.identifier,
    grant_ends_on: payload.grant_ends_on,
  };
}

export function requireSession(c) {
  const s = c.get('session');
  if (!s) refuse(401, 'authentication_required', { message: 'This route needs a session.' });
  return s;
}

export function requireRole(c, ...roles) {
  const s = requireSession(c);
  if (!hasRole(s, ...roles)) {
    refuse(403, 'not_permitted', {
      message: `This act is reserved for ${roles.join(' or ')}.`,
      role_held: s.roles,
      role_required: roles,
    });
  }
  return s;
}

// An auditor writes no operational record, at any route.
export function refuseAuditorWrites(c) {
  const s = c.get('session');
  if (s && s.roles?.includes('auditor')) {
    refuse(403, 'not_permitted', {
      message: 'An auditor reads, exports and annotates. An auditor writes no operational record.',
      role_held: s.roles,
    });
  }
}

// A write with no key at all is refused, so a retry can never be
// indistinguishable from a second act.
export async function idempotent(c, route, body, handler) {
  const key = c.req.header('idempotency-key');
  if (!key || !key.trim()) {
    refuse(400, 'idempotency_key_required', {
      message: 'Every write carries an Idempotency-Key header so a retry is never a second act.',
    });
  }
  const hash = bodyHash(body);
  const existing = await one('select * from idempotency where route = $1 and key = $2', [route, key]);
  if (existing) {
    if (existing.body_hash !== hash) {
      refuse(409, 'idempotency_key_reuse', {
        message: 'This key was used for a different body. A key is a promise about one act.',
        route,
        key,
      });
    }
    return { status: existing.status, body: existing.response, replayed: true };
  }
  const result = await handler();
  await query(
    'insert into idempotency (route, key, body_hash, status, response) values ($1,$2,$3,$4,$5) on conflict do nothing',
    [route, key, hash, result.status ?? 201, result.body ?? result],
  );
  return { status: result.status ?? 201, body: result.body ?? result, replayed: false };
}

export async function recordAct(entry) {
  return appendEntry(null, entry);
}

// Four answers are complete sets by contract and each refuses a page.
export function refusePagination(c) {
  const url = new URL(c.req.url);
  for (const p of ['page', 'limit', 'offset', 'cursor']) {
    if (url.searchParams.has(p)) {
      refuse(400, 'pagination_refused', {
        message: 'This answer is a complete set. A caller handed a page believes the work is finished.',
        parameter: p,
      });
    }
  }
}

export const nowIso = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

export const asDate = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);

// No route accepts a percentage, a carbon value or a loss figure.
const FORBIDDEN_INPUT = [
  'content_bp', 'recycled_content_bp', 'percentage', 'percent', 'recycled_content',
  'value_mg_per_kg', 'carbon_mg_per_kg', 'carbon_value', 'emissions_mg_per_kg',
  'losses_g', 'loss_g', 'yield_bp', 'share_bp', 'claim_share_g',
];
export function refuseComputedInput(body) {
  if (!body || typeof body !== 'object') return;
  for (const k of Object.keys(body)) {
    if (FORBIDDEN_INPUT.includes(k)) {
      refuse(400, 'computed_figure_not_accepted', {
        message: 'This figure is computed from the record. No route accepts it from a caller.',
        field: k,
      });
    }
  }
}

export function requireIntegerFields(body, fields) {
  for (const f of fields) {
    const v = body?.[f];
    if (v === undefined || v === null) {
      refuse(400, 'field_required', { message: `${f} is required.`, field: f });
    }
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      refuse(400, 'integer_required', {
        message: `${f} is an integer. No figure crosses the wire as a decimal.`,
        field: f,
      });
    }
  }
}

export function requireFields(body, fields) {
  for (const f of fields) {
    const v = body?.[f];
    if (v === undefined || v === null || v === '') {
      refuse(400, 'field_required', { message: `${f} is required and has no default.`, field: f });
    }
  }
}
