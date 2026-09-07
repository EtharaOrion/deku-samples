import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';

import { ScryptOptions } from 'node:crypto';
const scryptAsync = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))));

export const id = () => randomUUID();
export const nowId = () => randomUUID().replace(/-/g, '');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const key = await scryptAsync(password.normalize('NFKC'), salt, expected.length,
      { N: Number(n), r: Number(r), p: Number(p) });
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function ticketCode(): string {
  let out = '';
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `TKT-${out}`;
}

export function bearerToken(): string {
  return randomBytes(32).toString('base64url');
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** hue for a hex colour, 0..360 */
export function hexHue(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return hue;
}

export const RGB = (r: number, g: number, b: number) =>
  Object.assign([r, g, b], {
    toHex() {
      const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
      return `#${c(r)}${c(g)}${c(b)}`;
    },
  });

export function hsl(h: number, s: number, l: number) {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255] as [number, number, number];
}

/** full theme derived once, from the key colour */
export function deriveTheme(themeHex: string) {
  const hue = hexHue(themeHex);
  const ground = hsl(hue, 0.08, 0.94);
  const sunk = hsl(hue, 0.10, 0.90);
  const ink = hsl(hue, 1.0, 0.11);
  return {
    ground: RGB(...ground).toHex(),
    sunk: RGB(...sunk).toHex(),
    ink: RGB(...ink).toHex(),
    secondary: `rgba(0, 15, 58, 0.36)`,
    hairline: `rgba(0, 15, 58, 0.08)`,
    panelFill: `rgba(0, 15, 58, 0.04)`,
    key: themeHex,
  };
}

export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace('#', '');
    const v = [0, 2, 4].map((i) => {
      let c = parseInt(h.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
