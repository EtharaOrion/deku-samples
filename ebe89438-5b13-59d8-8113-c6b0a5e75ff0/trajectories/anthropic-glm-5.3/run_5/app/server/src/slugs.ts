import { ENV } from './env.js';
import { CATEGORIES } from './categories.js';

export const ROOT_NAMESPACE_TABLES: Array<{ table: string; column: string }> = [
  { table: 'events', column: 'slug' },
  { table: 'calendars', column: 'slug' },
  { table: 'accounts', column: 'handle' },
];

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 60);
}

export function isKebabCase(v: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) && v.length >= 1 && v.length <= 60;
}

const THEME_SOURCE = ['#f31a7c', '#146aeb', '#3cbd2c', '#ab46dd', '#d69712', '#007aff', '#28cd41', '#ff3b30'];

export function themeFromSeed(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % THEME_SOURCE.length;
  return THEME_SOURCE[idx];
}

export function seedHash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function coverPalette(seed: string): string[] {
  const h = seedHash(seed);
  const first = THEME_SOURCE[h % THEME_SOURCE.length];
  const second = THEME_SOURCE[(h + 1 + (Math.floor(h / 7) % 2)) % THEME_SOURCE.length];
  return [first, second];
}

export function coverAngle(seed: string): number {
  return (seedHash(seed + '|angle') % 360 + 360) % 360;
}

export function coverSpot(seed: string, salt: string): { x: number; y: number } {
  const h = seedHash(seed + '|' + salt);
  return { x: (h % 100) / 100, y: ((h >> 7) % 100) / 100 };
}

/** Eight uppercase letters and digits, unambiguous characters removed. */
const TICKET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newTicketCode(): string {
  const buf = new Uint8Array(8);
  (globalThis as any).crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < 8; i++) out += TICKET_ALPHABET[buf[i] % TICKET_ALPHABET.length];
  return `TKT-${out}`;
}

export function isTicketCodeShape(v: string): boolean {
  return /^TKT-[A-Z0-9]{8}$/.test(v);
}

export function newCoverSeed(title: string, city: string): string {
  const buf = new Uint8Array(6);
  (globalThis as any).crypto.getRandomValues(buf);
  return `${slugify(title) || 'event'}-${city.toLowerCase().replace(/[^a-z0-9]+/g, '')}-${Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const CATEGORY_LIST: readonly string[] = CATEGORIES;

export function publicUrl(path = ''): string {
  return `${ENV.publicUrl}${path}`;
}

export { isReservedPath, isCategory } from './categories.js';
