import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const PORT = Number(process.env.PORT ?? 4173);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const DATABASE_URL = process.env.DATABASE_URL ?? '';
export const SMTP_HOST = process.env.SMTP_HOST ?? '';
export const SMTP_PORT = Number(process.env.SMTP_PORT ?? 25);
export const SMTP_USER = process.env.SMTP_USER ?? '';
export const SMTP_PASS = process.env.SMTP_PASS ?? '';
export const APP_PUBLIC_URL = (process.env.APP_PUBLIC_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, '');

export const CATEGORIES = [
  'family', 'books', 'games', 'tech', 'food-and-drink', 'ai', 'running',
  'arts-and-culture', 'climate', 'fitness', 'wellness', 'crypto',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const RESERVED_PATHS = [
  'api', 'app', 'login', 'signup', 'home', 'calendars', 'create', 'discover',
  'settings', 'event', 't',
] as const;

export function isSlugReserved(v: string): boolean {
  return (RESERVED_PATHS as readonly string[]).includes(v)
    || (CATEGORIES as readonly string[]).includes(v);
}

// --- passwords -----------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expect = Buffer.from(parts[2], 'hex');
  const got = scryptSync(password, salt, expect.length);
  return expect.length === got.length && timingSafeEqual(expect, got);
}

// --- theme ---------------------------------------------------------------
const HUE_PAIRS: Array<[number, number]> = [
  [0.5406, 0.6247], [0.5926, 0.7429], [0.7578, 0.6852], [0.8176, 0.6262],
  [0.0521, 0.8043], [0.9899, 0.7637], [0.9208, 0.7958], [0.1002, 0.7243],
];
export function themeFromSeed(seed: string): string {
  const h = createHash('sha256').update(seed).digest();
  const [b, v] = HUE_PAIRS[h[7] % HUE_PAIRS.length];
  return hslToHex(b, v, 0.485);
}

export function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function ticketCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += alphabet[bytes[i] % alphabet.length];
  return `TKT-${out}`;
}
