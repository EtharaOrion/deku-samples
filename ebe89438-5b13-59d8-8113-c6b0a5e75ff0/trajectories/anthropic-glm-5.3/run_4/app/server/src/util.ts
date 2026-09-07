import crypto from 'node:crypto';

export function log(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ time: new Date().toISOString(), ...obj }) + '\n');
}

/** scrypt password hashing: scrypt$N$salt$hash */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const N = 16384;
  const key = crypto.scryptSync(password, salt, 64, { N }).toString('hex');
  return `scrypt$${N}$${salt}$${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, nStr, salt, key] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const N = Number(nStr);
    const candidate = crypto.scryptSync(password, salt, key.length / 2, { N }).toString('hex');
    const a = Buffer.from(candidate, 'hex');
    const b = Buffer.from(key, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;
}

const TICKET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** TKT- + 8 uppercase letters and digits (no ambiguous glyphs). */
export function newTicketCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += TICKET_ALPHABET[crypto.randomInt(TICKET_ALPHABET.length)];
  }
  return `TKT-${out}`;
}

/** 1-based waitlist position, from queue rank. */
export function isKebabCase(s: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && s.length >= 1 && s.length <= 64;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/** Derive the per-event theme colour from a seed string, mirroring the client. */
const THEME_SOURCE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function hash32(str: string): number {
  return xmur3(str)();
}

export function coverGradientFor(seed: string): { from: string; to: string; angle: number } {
  const h = hash32(seed);
  const i = h % THEME_SOURCE.length;
  const j = (i + 1 + ((h >>> 8) % (THEME_SOURCE.length - 1))) % THEME_SOURCE.length;
  return { from: THEME_SOURCE[i], to: THEME_SOURCE[j], angle: (h >>> 16) % 360 };
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const c = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((o) => parseInt(c.slice(o, o + 2), 16) / 255);
    const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const [la, lb] = [lum(hexA), lum(hexB)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}
