import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);

// scrypt is a modern memory-hard password hash, available in the Node standard
// library, so no extra dependency is pulled in for it.
const N = 16384;
const r = 8;
const p = 1;
const KEYLEN = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const parts = String(stored || '').split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, rr, pp, saltB64, keyB64] = parts;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scrypt(password, salt, expected.length, {
      N: Number(n), r: Number(rr), p: Number(pp), maxmem: 64 * 1024 * 1024,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export const sha256hex = (value) => createHash('sha256').update(String(value)).digest('hex');

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export const requestId = () => randomBytes(8).toString('hex');
