import type { Pool, PoolClient } from 'pg';

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.body = { message };
    if (field) this.body.field = field;
  }
}

export function logger(line: Record<string, unknown>) {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...line }) + '\n');
}

export function jsonOk(c: unknown, status = 200) {
  return Response.json(c as never, { status });
}

function isResponseLike(e: any): boolean {
  return !!e && typeof e === 'object' && typeof e.status === 'number' &&
    typeof e.text === 'function' && typeof e.headers === 'object' && typeof e.body !== 'undefined';
}

export function errResponse(e: unknown) {
  if (isResponseLike(e)) return e as Response;
  if (e instanceof ApiError) {
    return Response.json(e.body, { status: e.status });
  }
  const asErr = e as any;
  logger({ level: 'error', msg: 'unhandled', status: asErr && asErr.status, body: asErr && asErr.body, error: String(e instanceof Error ? e.stack : e) });
  return Response.json({ message: 'Something went wrong on our side. Please try again.' }, { status: 500 });
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newTicketCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return `TKT-${s}`;
}

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function toRfc3339Utc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function utcNowRfc3339(): string {
  return toRfc3339Utc(new Date());
}

export function asDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(v.trim());
  if (!m) return null;
  let s = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}`;
  if (m[7]) s += m[7].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  else s += 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function isIanaZone(z: unknown): boolean {
  if (typeof z !== 'string' || !/^[A-Za-z0-9_+\-/]+$/.test(z)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: z });
    return true;
  } catch {
    return false;
  }
}

export function toBool(v: unknown, dflt = false): boolean | null {
  if (v === undefined || v === null) return dflt;
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

export function toInt(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return null;
}

/** Any error inside this transaction helper causes a rollback of everything. */
export async function withTransaction<T>(pg: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pg.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* already aborted */ }
    throw e;
  } finally {
    c.release();
  }
}
