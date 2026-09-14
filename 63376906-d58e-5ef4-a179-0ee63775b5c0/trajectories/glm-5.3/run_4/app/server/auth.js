import crypto from 'node:crypto';
import { pool, q } from './db.js';
import { nowIso, sha256 } from './lib/util.js';
import { recordEntry } from './lib/record.js';

const ISSUER = process.env.AUTH_ISSUER_URL || '';
const CLIENT_ID = process.env.AUTH_CLIENT_ID || '';
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET || '';

export const ROLE_RANK = {
  plant_operator: 1,
  lab_analyst: 1,
  quality_manager: 1,
  claims_manager: 1,
  certificate_signer: 1,
  auditor: 0
};

export const DENIED_ACTS = {
  plant_operator: ['approve_collector', 'set_lot_disposition', 'change_batch_category', 'publish_carbon_method', 'publish_conversion_factor', 'close_balance_period', 'sign_certificate', 'allocate_claim', 'open_restatement', 'review_override', 'raise_deviation'],
  lab_analyst: ['set_lot_disposition', 'approve_collector', 'sign_certificate', 'publish_carbon_method', 'close_balance_period', 'allocate_claim', 'book_batch', 'review_override'],
  quality_manager: ['close_balance_period', 'sign_certificate', 'allocate_claim', 'open_restatement', 'publish_conversion_factor'],
  claims_manager: ['alter_carbon_method', 'sign_certificate', 'set_lot_disposition', 'approve_collector', 'publish_carbon_method'],
  certificate_signer: ['set_lot_disposition', 'approve_collector', 'close_balance_period', 'allocate_claim', 'publish_carbon_method', 'open_restatement', 'review_override'],
  auditor: ['*']
};

export async function login(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password
  });
  const res = await fetch(ISSUER + '/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) return null;
  const tok = await res.json();
  if (!tok.access_token) return null;
  const claims = decodeJwt(tok.access_token);
  if (!claims) return null;
  const u = await q('SELECT * FROM app_user WHERE email = $1', [email]);
  if (!u.rows.length) return null;
  const user = u.rows[0];
  const now = new Date();
  const jti = tok.access_token.length + ':' + sha256(tok.access_token).slice(0, 40);
  const session = {
    jti,
    email,
    name: user.name,
    role: user.role,
    sites: user.sites,
    exp: now.getTime() + 12 * 3600 * 1000
  };
  await pool.query(
    `INSERT INTO sessions (jti, email, exp) VALUES ($1,$2,$3)
     ON CONFLICT (jti) DO UPDATE SET exp = $3`,
    [jti, email, new Date(session.exp).toISOString()]
  );
  return {
    access_token: jti,
    token_type: 'bearer',
    expires_in: 12 * 3600,
    user: session
  };
}

export function decodeJwt(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export async function authenticate(token) {
  if (!token) return null;
  const r = await pool.query('SELECT * FROM sessions WHERE jti = $1', [token]);
  if (!r.rows.length) return null;
  const s = r.rows[0];
  if (new Date(s.exp).getTime() < Date.now()) {
    await pool.query('DELETE FROM sessions WHERE jti = $1', [token]);
    return null;
  }
  const u = await pool.query('SELECT * FROM app_user WHERE email = $1', [s.email]);
  if (!u.rows.length) return null;
  const user = u.rows[0];
  if (user.grant_ends && user.grant_ends < nowIso().slice(0, 10)) return null;
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    sites: user.sites,
    exp: new Date(s.exp).toISOString()
  };
}

export function ctxUser(c) {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

export function requireSession() {
  return async (c, next) => {
    const token = ctxUser(c);
    const user = token ? await authenticate(token) : null;
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    c.set('user', user);
    await next();
  };
}

export function requireRole(...roles) {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'unauthorized' }, 401);
    if (!roles.includes(user.role)) {
      await recordEntry({
        person: user.email,
        site: null,
        object: c.req.path,
        act: 'access_denied',
        payload: { path: c.req.path, role: user.role, required: roles },
        refused: true
      });
      return c.json({ error: 'forbidden', required_roles: roles }, 403);
    }
    await next();
  };
}

export function siteInScope(user, site) {
  return Array.isArray(user.sites) && user.sites.includes(site);
}
