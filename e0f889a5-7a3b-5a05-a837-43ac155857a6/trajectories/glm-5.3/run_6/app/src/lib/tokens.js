import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Auth is app implemented: email and password are exchanged for a bearer token.
// Passwords are hashed with scrypt; tokens are signed, carry an expiry and need
// no table of their own.

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function secret() {
  const s = process.env.AUTH_SECRET || process.env.AUTH_TOKEN_SECRET;
  if (s && s.length >= 16) return s;
  // Derive a stable secret from the database URL so tokens survive a restart
  // without an extra required variable.
  return 'vela:' + (process.env.DATABASE_URL || 'vela-local');
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadB64) {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function issueToken(customerId) {
  const payload = { cid: customerId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function readToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return null;
  const expected = sign(payloadB64);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || (typeof payload.cid !== 'number' && typeof payload.cid !== 'string')) return null;
  if (typeof payload.exp !== 'number') return null;
  if (payload.exp * 1000 <= Date.now()) return null; // expired: rejected, mutates nothing
  return { cid: Number(payload.cid), exp: payload.exp };
}
