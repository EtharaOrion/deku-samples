import crypto from 'node:crypto';
import { one } from './db.js';
import { unauthorized } from './errors.js';

// Passwords are stored hashed with scrypt, a modern memory-hard password hash
// from the platform itself, so the image carries no native build step.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 512 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${dk.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const dk = crypto.scryptSync(password, salt, expected.length, {
      N: Number(N), r: Number(r), p: Number(p), maxmem: 512 * 1024 * 1024,
    });
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}

function secret() {
  return process.env.AUTH_SECRET || process.env.DATABASE_URL || 'vela-development-secret';
}

const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL || 60 * 60 * 12);

/** Email and password exchange for a bearer token. Tokens expire. */
export function issueToken(customerId, ttlSeconds = TOKEN_TTL_SECONDS) {
  const payload = {
    sub: customerId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.sub || !payload?.exp) return null;
  if (payload.exp * 1000 <= Date.now()) return null; // an expired token is rejected
  return payload;
}

export function bearerFrom(req) {
  const header = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (m) return m[1].trim();
  const cookie = req.headers.get('cookie') || '';
  const cm = /(?:^|;\s*)vela_token=([^;]+)/.exec(cookie);
  return cm ? decodeURIComponent(cm[1]) : null;
}

/** Resolve the signed-in customer, or null. Never throws for absent tokens. */
export async function currentCustomer(req) {
  const token = bearerFrom(req);
  const payload = readToken(token);
  if (!payload) return null;
  const row = await one(
    `SELECT id, email, name, status, created_at FROM customer WHERE id = $1 AND status = 'active'`,
    [payload.sub],
  );
  return row ?? null;
}

/** Require a customer. An expired or absent token is rejected and mutates nothing. */
export async function requireCustomer(req) {
  const customer = await currentCustomer(req);
  if (!customer) throw unauthorized('Sign in to continue.', 'unauthorized');
  return customer;
}

export function hashOpaque(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}
