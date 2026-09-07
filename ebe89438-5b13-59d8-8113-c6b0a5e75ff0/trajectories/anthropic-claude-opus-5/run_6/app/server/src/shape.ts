import { z } from 'zod';
import { AppError, invalid } from './errors.js';
import { CATEGORIES } from './domain.js';

export const rfc3339 = z.string().refine(
  (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(v) && !Number.isNaN(Date.parse(v)),
  { message: 'must be an instant in UTC written as RFC 3339 with a trailing Z' },
);

export const categoryEnum = z.enum(CATEGORIES);

export function isValidZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)*$/.test(tz);
  } catch {
    return false;
  }
}

export const timeZoneField = z.string().refine(isValidZone, { message: 'must be an IANA time zone name' });

/** Validates before anything is written; a rejection names the offending field. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) {
    const first = r.error.issues[0];
    const field = first.path.join('.') || 'body';
    throw invalid(field, `${field}: ${first.message}`);
  }
  return r.data;
}

export async function readJson(c: any): Promise<unknown> {
  try {
    const text = await c.req.text();
    if (!text) return {};
    return JSON.parse(text);
  } catch {
    throw new AppError(400, 'body: send a JSON object.', { field: 'body' });
  }
}

export function toIso(v: string | Date | null): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' ? new Date(v).toISOString() : v.toISOString();
}
