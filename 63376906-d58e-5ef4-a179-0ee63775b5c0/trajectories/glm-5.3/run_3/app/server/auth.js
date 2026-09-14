import crypto from 'node:crypto';
import { q, one } from './db.js';
import { err } from './record.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID || 'ravel-app';
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

export const SITE_SCOPED = ['plant_operator', 'lab_analyst', 'quality_manager', 'claims_manager', 'certificate_signer', 'auditor'];

let wellknown = null;
async function tokenUrl() {
  if (!wellknown) {
    const r = await fetch(`${ISSUER}/.well-known/openid-configuration`);
    if (!r.ok) err(503, 'auth_unavailable');
    wellknown = await r.json();
  }
  return wellknown.token_endpoint;
}

export async function keycloakLogin(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password', client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    username: email, password, scope: 'openid email profile',
  });
  const r = await fetch(await tokenUrl(), { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) return null;
  const t = await r.json();
  const me = await fetch(`${ISSUER}/protocol/openid-connect/userinfo`, { headers: { authorization: `Bearer ${t.access_token}` } });
  if (!me.ok) return null;
  const u = await me.json();
  return { email: (u.email || email).toLowerCase(), name: u.name || email, roles: (u.realm_access && u.realm_access.roles) || [], sub: u.sub, expires_in: t.expires_in };
}

export function signToken(payload) {
  const secret = process.env.AUTH_CLIENT_SECRET || 'ravel';
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 12 * 3600 };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${enc(header)}.${enc(body)}`).digest('base64url');
  return `${enc(header)}.${enc(body)}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [h, b, s] = token.split('.');
    const secret = process.env.AUTH_CLIENT_SECRET || 'ravel';
    const expect = crypto.createHmac('sha256', secret).update(`${h}.${b}`).digest('base64url');
    if (expect !== s) return null;
    const body = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (body.exp * 1000 < Date.now()) return null;
    return body;
  } catch { return null; }
}

export async function principalFromToken(token) {
  if (!token) return null;
  const claims = verifyToken(token.replace(/^Bearer\s+/i, ''));
  if (!claims) return null;
  const acc = await one(`select a.email, a.name, a.role, coalesce(json_agg(g.site) filter (where g.site is not null and g.valid_to >= current_date), '[]') as sites
                         from account a left join grant_ g on g.email = a.email where a.email = $1 group by a.email, a.name, a.role`, [claims.email]);
  if (!acc) return null;
  const expiring = await q(`select site from grant_ where email = $1 and valid_to < current_date + interval '14 days'`, [claims.email]);
  return { email: acc.email, name: acc.name, role: acc.role, sites: acc.sites, expiring_sites: expiring.map((r) => r.site), exp: claims.exp };
}

export function requireSession(c) {
  if (!c) err(401, 'session_required');
  return c;
}
export function requireRole(c, ...roles) {
  requireSession(c);
  if (!roles.includes(c.role)) err(403, 'role_not_permitted', { role: c.role, needs: roles });
  return c;
}
export function requireSite(c, site) {
  requireSession(c);
  if (SITE_SCOPED.includes(c.role) && !(c.sites || []).includes(site)) err(403, 'site_out_of_scope', { site, scope: c.sites });
  return c;
}
export function readOnly(c) { requireSession(c); if (c.role !== 'auditor') err(403, 'auditor_read_only'); return c; }
