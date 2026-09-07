export class Refusal extends Error {
  status: number;
  field?: string;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, field?: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.field = field;
    this.extra = extra;
  }
}

export const refuse = (status: number, message: string, field?: string, extra?: Record<string, unknown>) =>
  new Refusal(status, message, field, extra);

export const notFound = () => new Refusal(404, 'Looks like you discovered a page that doesn\u2019t exist or you don\u2019t have access to.');

export function str(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

/** True when the caller actually supplied a value for the field. */
export function provided(v: unknown) {
  return v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');
}

export function requireString(body: any, field: string, opts: { max?: number; label?: string } = {}) {
  const v = str(body?.[field]);
  if (!v) throw refuse(400, `${opts.label || field} is required.`, field);
  if (opts.max && v.length > opts.max) throw refuse(400, `${opts.label || field} is too long.`, field);
  return v;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmail(body: any, field = 'email') {
  const v = str(body?.[field]).toLowerCase();
  if (!v || !EMAIL_RE.test(v) || v.length > 320) throw refuse(400, 'Enter a valid email address.', field);
  return v;
}

export function requirePassword(body: any, field = 'password') {
  const v = typeof body?.[field] === 'string' ? body[field] : '';
  if (!v) throw refuse(400, 'Enter your password.', field);
  if (v.length < 8) throw refuse(400, 'Use a password of at least 8 characters.', field);
  if (v.length > 200) throw refuse(400, 'That password is too long.', field);
  return v;
}

/** Every timestamp crossing the API is an instant in UTC written RFC 3339 with a trailing Z. */
export function parseInstant(value: unknown, field: string): string {
  const v = str(value);
  if (!v) throw refuse(400, `${field} is required.`, field);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v)) {
    throw refuse(400, `${field} must be an instant in UTC ending in Z.`, field);
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw refuse(400, `${field} is not a valid time.`, field);
  return d.toISOString();
}

export function optionalInstant(value: unknown, field: string): string | null {
  if (value === undefined || value === null || str(value) === '') return null;
  return parseInstant(value, field);
}

export function parseCapacity(value: unknown, field = 'capacity'): number {
  const n = typeof value === 'number' ? value : Number(str(value));
  if (!Number.isInteger(n)) throw refuse(400, 'Capacity is a whole number of seats.', field);
  if (n < 1 || n > 500) throw refuse(400, 'Capacity is between 1 and 500.', field);
  return n;
}

export function parseBool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const v = String(value).toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

export function isValidTimeZone(tz: string) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
