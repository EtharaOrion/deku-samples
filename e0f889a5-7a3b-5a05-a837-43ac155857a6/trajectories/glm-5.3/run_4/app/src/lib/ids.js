import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Simple constant-time password hash using scrypt (a modern memory-hard KDF). */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1, keylen = 64;
  const key = crypto.scryptSync(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const parts = String(stored).split('$');
    if (parts[0] !== 'scrypt') return false;
    const [, Ns, rs, ps, saltB64, keyB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const key = Buffer.from(keyB64, 'base64');
    const out = crypto.scryptSync(String(password), salt, key.length, { N: Number(Ns), r: Number(rs), p: Number(ps) });
    return crypto.timingSafeEqual(out, key);
  } catch {
    return false;
  }
}

/** Group a serial for display: VC26 09 PVDA 7Q style grouping is avoided; we show raw. */
export function isValidSerialShape(serial) {
  if (typeof serial !== 'string') return false;
  const s = serial.trim().toUpperCase();
  if (s.length !== 12) return false;
  if (!/^[A-Z]{2}\d{4}[A-HJ-NP-Z2-9]{6}$/.test(s)) return false;
  return true;
}

export function serialModelCode(serial) {
  return String(serial).slice(0, 2).toUpperCase();
}

/** Parse dotted version into comparable integer triple. Returns null when unparseable. */
export function parseVersion(v) {
  if (v === null || v === undefined || v === '') return null;
  const parts = String(v).trim().split('.').map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  }
  return 0;
}

export function versionAtLeast(a, min) {
  if (min === null || min === undefined || min === '') return true;
  return compareVersions(a, min) >= 0;
}

export { ALPHABET };
