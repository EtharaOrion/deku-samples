import type { PoolClient } from 'pg';
import { CATEGORIES, RESERVED_PATHS } from './constants.js';

export function themeFromSeed(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = Math.abs(h) % 360;
  const sat = 74 + (Math.abs(h >> 8) % 16);
  const lig = 40 + (Math.abs(h >> 16) % 14);
  return hslToHex(hue, sat, lig);
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sn * Math.min(ln, 1 - ln);
  const f = (n: number) => {
    const v = ln - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
    return Math.round(255 * v).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHsl(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const full = m ? m[1] : '146aeb';
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function rgba(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const full = m ? m[1] : '146aeb';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function deriveTheme(themeHex: string) {
  const [h, s, l] = hexToHsl(themeHex);
  const ink = hslToHex(h, Math.max(s, 62), 11);
  return {
    ground: hslToHex(h, 8, 94),
    sunk: hslToHex(h, 10, 90),
    ink,
    ink2: rgba(ink, 0.36),
    hairline: rgba(ink, 0.08),
    panel: rgba(ink, 0.04),
    soft: rgba(ink, 0.64),
    valid: !(l > 93 || s < 6),
    key: themeHex.toLowerCase(),
  };
}

export type SlugRefusalCode = 'reserved' | 'category' | 'taken' | 'invalid';

/**
 * Must be called inside a transaction that holds pg_advisory_xact_lock(918273)
 * so the namespace check cannot race another writer.
 */
export async function checkRootSlug(c: PoolClient, slug: string, allowSelf?: { table: string; col: string; id: string }): Promise<SlugRefusalCode | null> {
  const l = slug.toLowerCase();
  if (!(RESERVED_PATHS as readonly string[]).every((p) => p !== l)) return 'reserved';
  if ((CATEGORIES as readonly string[]).includes(l)) return 'category';
  const evSelf = allowSelf && allowSelf.table === 'events' ? allowSelf.id : '';
  const calSelf = allowSelf && allowSelf.table === 'calendars' ? allowSelf.id : '';
  const accSelf = allowSelf && allowSelf.table === 'accounts' ? allowSelf.id : '';
  const q = `SELECT
      (SELECT 1 FROM events WHERE slug = $1 AND id <> $2::text) AS e,
      (SELECT 1 FROM calendars WHERE slug = $1 AND id <> $3::text) AS c,
      (SELECT 1 FROM accounts WHERE handle = $1 AND id <> $4::text) AS a`;
  const r = await c.query(q, [l, evSelf, calSelf, accSelf]);
  const row = r.rows[0];
  if (row && (row.e || row.c || row.a)) return 'taken';
  return null;
}
