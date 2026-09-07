import { bad } from './http.js';

export interface Body { [k: string]: unknown }

export function body(req: { json: () => Promise<unknown> }): Promise<Body> {
  return req.json().catch(() => {
    throw bad('Send a JSON body with your request.');
  }).then((v) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw bad('Send a JSON object with your request.');
    return v as Body;
  });
}

export function str(b: Body, key: string, opts: { required?: boolean; max?: number; min?: number; label?: string } = {}): string | undefined {
  const raw = b[key];
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) throw bad(`Add your ${opts.label ?? key} so we can continue.`, { [key]: `Add your ${opts.label ?? key}.` });
    return undefined;
  }
  if (typeof raw !== 'string') throw bad(`${key} must be text.`, { [key]: 'Enter text.' });
  const v = raw.trim();
  if (opts.min !== undefined && v.length < opts.min) throw bad(`Make ${opts.label ?? key} at least ${opts.min} characters.`, { [key]: `At least ${opts.min} characters.` });
  if (opts.max !== undefined && v.length > opts.max) throw bad(`Keep ${opts.label ?? key} under ${opts.max} characters.`, { [key]: `Under ${opts.max} characters.` });
  return v;
}

export function bool(b: Body, key: string, fallback?: boolean): boolean | undefined {
  const raw = b[key];
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'boolean') return raw;
  throw bad(`${key} must be true or false.`, { [key]: 'Choose true or false.' });
}

export function int(b: Body, key: string, opts: { required?: boolean; min?: number; max?: number; label?: string } = {}): number | undefined {
  const raw = b[key];
  if (raw === undefined || raw === null || raw === '') {
    if (opts.required) throw bad(`Add ${opts.label ?? key} to continue.`, { [key]: `Add ${opts.label ?? key}.` });
    return undefined;
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw bad(`${key} must be a whole number.`, { [key]: 'Enter a whole number.' });
  if (opts.min !== undefined && n < opts.min) throw bad(`${key} must be at least ${opts.min}.`, { [key]: `At least ${opts.min}.` });
  if (opts.max !== undefined && n > opts.max) throw bad(`${key} must be at most ${opts.max}.`, { [key]: `At most ${opts.max}.` });
  return n;
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function instant(b: Body, key: string, required: boolean): string | undefined {
  const raw = b[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw bad(`Add ${key} as a UTC time, like 2026-06-04T18:00:00Z.`, { [key]: 'Add a UTC time ending in Z.' });
    return undefined;
  }
  if (typeof raw !== 'string' || !ISO_RE.test(raw)) {
    throw bad(`Write ${key} as an instant in UTC with a trailing Z, like 2026-06-04T18:00:00Z.`, { [key]: 'Use a UTC time ending in Z.' });
  }
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) throw bad(`${key} is not a real moment.`, { [key]: 'Pick a real moment.' });
  return new Date(ms).toISOString();
}

export function email(b: Body, key = 'email', required = true): string | undefined {
  const raw = b[key];
  if (raw === undefined || raw === null || raw === '') {
    if (required) throw bad('Enter a valid email address.', { email: 'Enter a valid email address.' });
    return undefined;
  }
  if (typeof raw !== 'string') throw bad('Enter a valid email address.', { email: 'Enter a valid email address.' });
  const v = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 254) throw bad('Enter a valid email address.', { email: 'Enter a valid email address.' });
  return v;
}

export function password(b: Body, key = 'password'): string {
  const raw = b[key];
  if (typeof raw !== 'string' || raw.length < 8) throw bad('Choose a password of at least 8 characters.', { password: 'At least 8 characters.' });
  if (raw.length > 200) throw bad('Choose a password under 200 characters.', { password: 'Under 200 characters.' });
  return raw;
}
