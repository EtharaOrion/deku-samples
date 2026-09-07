import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { q } from './db.js';

const ISSUER = process.env.AUTH_ISSUER_URL;
const CLIENT_ID = process.env.AUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.AUTH_CLIENT_SECRET;

// The app issues its own token; it never accepts an identity a caller asserts.
const APP_SECRET = new TextEncoder().encode(
  process.env.APP_TOKEN_SECRET || crypto.createHash('sha256').update(String(CLIENT_SECRET || 'ravel')).digest('hex')
);

const TWELVE_HOURS = 12 * 60 * 60;

export async function keycloakPassword(email, password) {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    username: email,
    password,
    scope: 'openid',
  });
  const res = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) return null;
  const json = await res.json();
  const claims = JSON.parse(Buffer.from(json.access_token.split('.')[1], 'base64url').toString('utf8'));
  return { claims, raw: json };
}

export async function issueAppToken(personRow, claims) {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    email: personRow.email,
    name: personRow.name,
    roles: personRow.roles,
    sites: personRow.sites,
    sub: personRow.identifier,
    kc_sub: claims?.sub || null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + TWELVE_HOURS)
    .setIssuer('ravel')
    .sign(APP_SECRET);
  return { access_token: token, token_type: 'Bearer', expires_in: TWELVE_HOURS };
}

export async function verifyAppToken(token) {
  try {
    const { payload } = await jwtVerify(token, APP_SECRET, { issuer: 'ravel' });
    return payload;
  } catch {
    return null;
  }
}

export async function personByEmail(email) {
  const rows = await q('SELECT * FROM person WHERE lower(email) = lower($1)', [email]);
  return rows[0] || null;
}

export function bearerFrom(c) {
  const h = c.req.header('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

// Authorization is decided on the server for every mutating route.
export const ROLE_ACTS = {
  plant_operator: ['batch.book', 'batch.reject', 'batch.custody', 'run.open', 'run.consume', 'run.output', 'run.close', 'inbound.post', 'yield.read', 'lot.blend'],
  lab_analyst: ['test.enter', 'inbound.post', 'lot.blend'],
  quality_manager: ['collector.approve', 'lot.disposition', 'deviation.raise', 'deviation.close', 'carbon.publish', 'override.record', 'override.review', 'yield.read', 'site.certification', 'change_notice.raise', 'change_notice.notify', 'change_notice.release', 'spec.issue', 'test.enter', 'carbon.recompute', 'lot.blend', 'energy.retire'],
  claims_manager: ['balance.allocate', 'balance.close', 'balance.transfer', 'factor.publish', 'restatement.open', 'restatement.resolve', 'override.review', 'yield.read', 'contract.allocate', 'energy.retire', 'carbon.recompute'],
  certificate_signer: ['certificate.sign', 'certificate.reissue', 'certificate.withdraw', 'certificate.preview'],
  auditor: ['export.create', 'annotation.create'],
};

export function actorCan(actor, act) {
  if (!actor) return false;
  return (actor.roles || []).some((r) => (ROLE_ACTS[r] || []).includes(act));
}
