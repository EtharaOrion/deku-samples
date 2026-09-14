import { actorName } from './units.js';

export const SEED_PEOPLE = {
  'plant@example.com': 'Ines Bekele',
  'analyst@example.com': 'Tomas Vlach',
  'quality@example.com': 'Marit Solheim',
  'claims@example.com': 'Osei Danquah',
  'signer@example.com': 'Hana Ferreira',
  'signer2@example.com': 'Pavel Ostrowski',
  'auditor@example.com': 'Ruth Lindqvist'
};

export class HttpError extends Error {
  constructor(status, code, extra) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra || {};
  }
}

async function kcToken(email, password) {
  const body = new URLSearchParams({ grant_type: 'password', client_id: process.env.AUTH_CLIENT_ID, username: email, password });
  if (process.env.AUTH_CLIENT_SECRET) body.set('client_secret', process.env.AUTH_CLIENT_SECRET);
  const res = await fetch(`${process.env.AUTH_ISSUER_URL}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new HttpError(401, 'invalid_credentials');
  const j = await res.json();
  if (!j.access_token) throw new HttpError(401, 'invalid_credentials');
  return j;
}

const issuer = () => process.env.AUTH_ISSUER_URL.replace(/\/$/, '');

export async function tokenIntrospect(token) {
  const body = new URLSearchParams({
    token,
    client_id: process.env.AUTH_CLIENT_ID,
    client_hint: 'access-token'
  });
  if (process.env.AUTH_CLIENT_SECRET) body.set('client_secret', process.env.AUTH_CLIENT_SECRET);
  const res = await fetch(`${issuer()}/protocol/openid-connect/token/introspect`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) return null;
  const j = await res.json();
  if (!j.active) return null;
  return j;
}

export async function passwordGrant(email, password) {
  return kcToken(email, password);
}

export function rolesFromToken(t) {
  const ra = t.realm_access && t.realm_access.roles ? t.realm_access.roles : [];
  return ra.filter((r) => ['plant_operator','lab_analyst','quality_manager','claims_manager','certificate_signer','auditor'].includes(r));
}

export async function sessionFromDb(db, email) {
  const { rows } = await db.query(
    `SELECT role, site, ends_on FROM grants WHERE email=$1 AND ends_on >= CURRENT_DATE`,
    [email]
  );
  const roles = [...new Set(rows.map((r) => r.role))];
  const sites = rows.map((r) => r.site);
  const name = (await actorName(db, email)) || SEED_PEOPLE[email] || email;
  return { email, roles, sites, name };
}

export function can(session, role) {
  return session && session.roles.includes(role);
}

export function requireRole(session, role, code) {
  if (!can(session, role)) throw new HttpError(403, code || 'forbidden_role');
}

export function siteInScope(session, site) {
  return session.sites.includes(site);
}

const KIND = {
  plant_operator: 'plant operator',
  lab_analyst: 'laboratory analyst',
  quality_manager: 'quality manager',
  claims_manager: 'claims manager',
  certificate_signer: 'certificate signer',
  auditor: 'auditor'
};
export const roleLabel = (r) => KIND[r] || r;
