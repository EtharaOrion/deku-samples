import crypto from 'node:crypto';
import { q, one } from './db.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

const SECRET =
  process.env.APP_TOKEN_SECRET ||
  crypto.createHash('sha256').update(`ravel|${CLIENT_SECRET || 'x'}|${ISSUER || 'y'}`).digest('hex');

const TWELVE_HOURS = 12 * 60 * 60;

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function issueToken(claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ ...claims, iat: now, exp: now + TWELVE_HOURS }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  const expect = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  const a = Buffer.from(s);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!claims.exp || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

// The app never accepts an identity a caller asserts: the password is exchanged
// at keycloak and only then does the app issue its own token.
export async function keycloakPassword(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password,
    scope: 'openid profile email',
  });
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  const idParts = String(json.access_token || '').split('.');
  if (idParts.length !== 3) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(idParts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  return {
    email: payload.email || payload.preferred_username || email,
    name: payload.name || email,
    roles: (payload.realm_access?.roles || []).filter((r) => KNOWN_ROLES.has(r)),
  };
}

export const KNOWN_ROLES = new Set([
  'plant_operator',
  'lab_analyst',
  'quality_manager',
  'claims_manager',
  'certificate_signer',
  'auditor',
]);

export async function grantFor(email) {
  return one('select * from access_grant where email = $1 order by ends_on desc limit 1', [email]);
}

export async function sessionFromRequest(c) {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return null;
  const claims = verifyToken(m[1]);
  if (!claims) return null;
  return claims;
}

export function hasRole(session, ...roles) {
  if (!session) return false;
  return roles.some((r) => (session.roles || []).includes(r));
}

export function inScope(session, site) {
  if (!session) return false;
  if (!site) return true;
  return (session.sites || []).includes(site);
}

export async function personIdFor(email) {
  const row = await one('select person_id from person_directory where email = $1', [email]);
  return row ? row.person_id : email;
}

export async function allPeople() {
  return q('select * from person_directory order by email');
}
