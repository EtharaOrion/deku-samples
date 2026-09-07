import { bad } from './errors.ts';
import { CATEGORIES, RESERVED_PATHS } from './seed.ts';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_RE = /^#[0-9a-f]{6}$/;
export const TZ_RE = /^[A-Za-z]+\/[A-Za-z0-9_+\-]+$/;

export function isEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim());
}

export function isSlug(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= 64 && SLUG_RE.test(v);
}

export function isHandle(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= 64 && HANDLE_RE.test(v);
}

export function isCategory(v: unknown): v is string {
  return typeof v === 'string' && (CATEGORIES as readonly string[]).includes(v);
}

export function isReserved(v: string): boolean {
  const s = v.toLowerCase();
  return (RESERVED_PATHS as readonly string[]).includes(s) || (CATEGORIES as readonly string[]).includes(s);
}

/** RFC 3339 with a trailing Z (or an explicit numeric offset, normalised to Z). */
export function parseInstant(v: unknown, field: string): Date {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(v.trim())) {
    throw bad(`Enter ${field} as a date and time with a UTC offset.`, { field });
  }
  const d = new Date(v.trim().replace(' ', 'T'));
  if (isNaN(d.getTime())) throw bad(`Enter ${field} as a valid date and time.`, { field });
  return d;
}

export function toZulu(d: Date | string): string {
  return new Date(d).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function needString(body: any, field: string, opts: { min?: number; max?: number } = {}): string {
  const v = body?.[field];
  if (typeof v !== 'string') throw bad(`Add ${field} so we can continue.`, { field });
  const t = v.trim();
  const min = opts.min ?? 1;
  if (t.length < min) throw bad(`Add ${field} so we can continue.`, { field });
  if (opts.max && t.length > opts.max) throw bad(`${field} is too long.`, { field });
  return t;
}

export function optString(body: any, field: string, opts: { min?: number; max?: number } = {}): string | undefined {
  if (body?.[field] === undefined || body?.[field] === null) return undefined;
  return needString(body, field, opts);
}

export function needInt(body: any, field: string, opts: { min?: number; max?: number }): number {
  const v = body?.[field];
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) throw bad(`Enter ${field} as a whole number.`, { field });
  if (opts.min !== undefined && n < opts.min) throw bad(`Enter ${field} between ${opts.min} and ${opts.max}.`, { field });
  if (opts.max !== undefined && n > opts.max) throw bad(`Enter ${field} between ${opts.min} and ${opts.max}.`, { field });
  return n;
}

export function needBool(body: any, field: string): boolean {
  const v = body?.[field];
  if (typeof v !== 'boolean') throw bad(`Set ${field} to true or false.`, { field });
  return v;
}

export function optBool(body: any, field: string): boolean | undefined {
  if (body?.[field] === undefined || body?.[field] === null) return undefined;
  return needBool(body, field);
}

export function optCategory(body: any, field: string): string | undefined {
  const v = body?.[field];
  if (v === undefined || v === null || v === '') return undefined;
  if (!isCategory(v)) throw bad(`Pick one of the twelve categories.`, { field });
  return v as string;
}
