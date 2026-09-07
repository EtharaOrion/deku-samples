import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { one } from './db.js';
import { fail } from './util.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

// The app signs its own sessions. It never accepts an identity a caller asserts.
const SECRET = new TextEncoder().encode(
  process.env.APP_SESSION_SECRET || randomBytes(32).toString('hex')
);
const TWELVE_HOURS = 12 * 60 * 60;

export const ROLE_LABELS = {
  plant_operator: 'Plant operator',
  lab_analyst: 'Laboratory analyst',
  quality_manager: 'Quality manager',
  claims_manager: 'Claims manager',
  certificate_signer: 'Certificate signer',
  auditor: 'Auditor',
};

/** Exchange email + password at keycloak. Returns the keycloak claims or null. */
export async function verifyPassword(email, password) {
  if (!ISSUER) throw new Error('AUTH_ISSUER_URL is not set');
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password,
    scope: 'openid',
  });
  let res;
  try {
    res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    fail(503, { error: 'identity_provider_unavailable' });
  }
  if (!res.ok) return null;
  const tok = await res.json();
  const payload = JSON.parse(
    Buffer.from(tok.access_token.split('.')[1], 'base64url').toString('utf8')
  );
  return payload;
}

export async function issueSession(email) {
  const u = await one('SELECT * FROM app_user WHERE email = $1', [email]);
  if (!u) return null;
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    email: u.email,
    name: u.name,
    roles: [u.role],
    sites: u.sites,
    grant_ends_on: u.grant_ends_on ? new Date(u.grant_ends_on).toISOString().slice(0, 10) : null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + TWELVE_HOURS)
    .setIssuer('ravel')
    .sign(SECRET);
  return { access_token: token, token_type: 'Bearer', expires_in: TWELVE_HOURS };
}

export async function readSession(c) {
  const h = c.req.header('authorization') || '';
  if (!h.toLowerCase().startsWith('bearer ')) return null;
  try {
    const { payload } = await jwtVerify(h.slice(7).trim(), SECRET, { issuer: 'ravel' });
    return payload;
  } catch {
    return null;
  }
}

export function requireSession(c) {
  const s = c.get('session');
  if (!s) fail(401, { error: 'authentication_required' });
  return s;
}

export function hasRole(session, ...roles) {
  return roles.some((r) => (session.roles || []).includes(r));
}

export function requireRole(c, ...roles) {
  const s = requireSession(c);
  if (!hasRole(s, ...roles)) {
    fail(403, {
      error: 'role_not_permitted',
      required: roles,
      held: s.roles,
      message: `This act requires ${roles.join(' or ')}. Your role is ${(s.roles || []).join(', ')}.`,
    });
  }
  return s;
}

export function requireSite(c, site) {
  const s = requireSession(c);
  if (!(s.sites || []).includes(site)) {
    fail(403, {
      error: 'site_out_of_scope',
      site,
      scope: s.sites,
      message: `Your grant does not cover ${site}. It covers ${(s.sites || []).join(', ')}.`,
    });
  }
  return s;
}

// The auditor writes no operational record, at any route.
export function refuseAuditorWrites(c) {
  const s = c.get('session');
  if (s && (s.roles || []).includes('auditor')) {
    fail(403, {
      error: 'auditor_is_read_only',
      message: 'An auditor reads, exports and annotates. It writes no operational record.',
    });
  }
}
