import crypto from 'node:crypto';
import { one } from './db.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.createHash('sha256')
    .update(String(CLIENT_SECRET || 'ravel') + '|' + String(ISSUER || '')).digest('hex');

const TWELVE_HOURS = 12 * 60 * 60;

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

// The app issues its own token; it never accepts an identity a caller asserts.
export function issueToken(claims) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const iat = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...claims, iat, exp: iat + TWELVE_HOURS }));
  const sig = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(header + '.' + body).digest());
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const expect = b64url(crypto.createHmac('sha256', SESSION_SECRET).update(parts[0] + '.' + parts[1]).digest());
  const a = Buffer.from(expect);
  const b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try { payload = JSON.parse(b64urlDecode(parts[1])); } catch { return null; }
  if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
  return payload;
}

// Exchanges email and password at keycloak. Returns the keycloak claims or null.
export async function keycloakPassword(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password,
    scope: 'openid email profile',
  });
  let res;
  try {
    res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.access_token) return null;
  const claims = JSON.parse(b64urlDecode(json.access_token.split('.')[1]));
  return {
    email: claims.email || email,
    name: claims.name || claims.preferred_username || email,
    roles: (claims.realm_access?.roles || []).filter((r) => !r.startsWith('default-') && !['offline_access', 'uma_authorization'].includes(r)),
    sub: claims.sub,
  };
}

export async function personFor(email) {
  return one('SELECT * FROM person WHERE email = $1', [email]);
}

export async function sessionFromRequest(c) {
  const header = c.req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const person = await personFor(payload.email);
  if (!person) return null;
  return {
    email: person.email,
    identifier: person.identifier,
    name: person.name,
    roles: [person.role],
    role: person.role,
    sites: person.sites,
    grant_ends_on: person.grant_ends_on,
  };
}
