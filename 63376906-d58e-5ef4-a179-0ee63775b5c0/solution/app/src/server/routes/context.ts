import type { Context } from 'hono';
import type pg from 'pg';
import { IDEMPOTENCY_REUSE, PAGINATION_PARAMS, type Role } from '../../shared/enums.js';
import { Refusal, requireRole, sessionFrom, type AppEnv } from '../auth/guard.js';
import type { Session } from '../auth/session.js';
import { pool, transaction } from '../db/pool.js';
import { sendMail, type Mail } from '../mail.js';
import { appendEntry, canonical, findByIdempotencyKey, sha256 } from '../record/entries.js';

export type Ctx = Context<AppEnv>;
export type Body = Record<string, unknown>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

export function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

class Invalid extends Error {
  constructor(readonly detail: string) {
    super(detail);
  }
  body(): Body {
    return { error: 'invalid_payload', detail: this.detail };
  }
}

export function refusePagination(c: Ctx): Response | null {
  const present = PAGINATION_PARAMS.filter((name) => c.req.query(name) !== undefined);
  if (present.length === 0) return null;
  return json({ error: 'pagination_refused', detail: `this route answers with the complete set; ${present.join(', ')} not accepted` }, 400);
}

export interface Outcome {
  status: number;
  body: Body;
  act?: string;
  object?: string;
  content?: unknown;
  at?: string;
  mail?: Mail[];
}

interface Mutation {
  act: string;
  roles?: readonly Role[];
  anonymous?: boolean;
  idempotency?: boolean;
}

export interface Work {
  c: Ctx;
  client: pg.PoolClient;
  session: Session | null;
  body: Body;
  person: string;
}

function firstParam(c: Ctx): string | undefined {
  const params = c.req.param() as Record<string, string>;
  const values = Object.values(params);
  return values.length > 0 ? values[0] : undefined;
}

function redact(body: Body): Body {
  const copy: Body = { ...body };
  delete copy.password;
  return copy;
}

async function readBody(c: Ctx): Promise<Body> {
  const raw = await c.req.text();
  if (raw.trim() === '') return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Invalid('body must be a JSON object');
  return parsed as Body;
}

async function recordRefusal(person: string, act: string, object: string | undefined, refusal: Refusal, key: string | undefined, digest: string | undefined): Promise<void> {
  const body = refusal.body();
  await transaction((client) => appendEntry(client, {
    person, act, object, outcome: 'refused', content: body,
    idempotency_key: key, request_digest: digest, response_status: refusal.status, response: body,
  }));
}

export function mutate(route: Mutation, work: (input: Work) => Promise<Outcome>) {
  return async (c: Ctx): Promise<Response> => {
    const session = sessionFrom(c);
    if (!route.anonymous && !session) return json({ error: 'unauthenticated', detail: 'a session is required' }, 401);
    const person = session?.email ?? 'anonymous';
    const object = firstParam(c);
    const key = c.req.header('Idempotency-Key');
    try {
      if (route.roles && session) requireRole(session, route.roles, route.act);
    } catch (error) {
      if (error instanceof Refusal) {
        await recordRefusal(person, route.act, object, error, key, undefined);
        return json(error.body(), error.status);
      }
      throw error;
    }
    if (route.idempotency !== false && !key) {
      return json({ error: 'idempotency_key_missing', detail: 'every write carries an Idempotency-Key header' }, 400);
    }
    let body: Body;
    try {
      body = await readBody(c);
    } catch (error) {
      return json({ error: 'invalid_payload', detail: error instanceof Error ? error.message : 'unreadable body' }, 400);
    }
    const digest = sha256(canonical(redact(body)));
    if (key) {
      const existing = await findByIdempotencyKey(pool, key);
      if (existing) {
        if (existing.request_digest === digest) return json(existing.response, existing.response_status ?? 200);
        return json({ error: IDEMPOTENCY_REUSE, detail: `Idempotency-Key ${key} was already used with a different body` }, 409);
      }
    }
    try {
      const outcome = await transaction(async (client) => {
        const result = await work({ c, client, session, body, person });
        await appendEntry(client, {
          person, at: result.at, act: result.act ?? route.act, object: result.object ?? object, outcome: 'recorded',
          content: result.content ?? redact(body), idempotency_key: key, request_digest: digest,
          response_status: result.status, response: result.body,
        });
        return result;
      });
      for (const mail of outcome.mail ?? []) await sendMail(mail);
      return json(outcome.body, outcome.status);
    } catch (error) {
      if (error instanceof Refusal) {
        await recordRefusal(person, route.act, object, error, key, digest);
        return json(error.body(), error.status);
      }
      if (error instanceof Invalid) return json(error.body(), 400);
      throw error;
    }
  };
}

export function read(work: (c: Ctx, session: Session) => Promise<Response>, roles?: readonly Role[]) {
  return async (c: Ctx): Promise<Response> => {
    const session = sessionFrom(c);
    if (!session) return json({ error: 'unauthenticated', detail: 'a session is required' }, 401);
    try {
      if (roles) requireRole(session, roles, 'read');
      return await work(c, session);
    } catch (error) {
      if (error instanceof Refusal) return json(error.body(), error.status);
      if (error instanceof Invalid) return json(error.body(), 400);
      throw error;
    }
  };
}

export function open(work: (c: Ctx) => Promise<Response>) {
  return async (c: Ctx): Promise<Response> => {
    try {
      return await work(c);
    } catch (error) {
      if (error instanceof Refusal) return json(error.body(), error.status);
      if (error instanceof Invalid) return json(error.body(), 400);
      throw error;
    }
  };
}

export function stringField(body: Body, key: string, required = true): string {
  const value = body[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw new Invalid(`${key} is required`);
    return '';
  }
  if (typeof value !== 'string') throw new Invalid(`${key} must be a string`);
  return value;
}

export function integerField(body: Body, key: string, required = true): number {
  const value = body[key];
  if (value === undefined || value === null) {
    if (required) throw new Invalid(`${key} is required`);
    return 0;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new Invalid(`${key} must be an integer`);
  return value;
}

export function nonNegative(body: Body, key: string, required = true): number {
  const value = integerField(body, key, required);
  if (value < 0) throw new Invalid(`${key} must not be negative`);
  return value;
}

export function enumField<T extends readonly string[]>(body: Body, key: string, list: T, required = true): T[number] {
  const value = stringField(body, key, required);
  if (!required && value === '') return '' as T[number];
  if (!list.includes(value)) throw new Invalid(`${key} must be one of ${list.join(', ')}`);
  return value as T[number];
}

export function booleanField(body: Body, key: string, required = true): boolean {
  const value = body[key];
  if (value === undefined || value === null) {
    if (required) throw new Invalid(`${key} is required`);
    return false;
  }
  if (typeof value !== 'boolean') throw new Invalid(`${key} must be true or false`);
  return value;
}

export function objectField(body: Body, key: string, required = true): Body {
  const value = body[key];
  if (value === undefined || value === null) {
    if (required) throw new Invalid(`${key} is required`);
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) throw new Invalid(`${key} must be an object`);
  return value as Body;
}

export function listField(body: Body, key: string, required = true): unknown[] {
  const value = body[key];
  if (value === undefined || value === null) {
    if (required) throw new Invalid(`${key} is required`);
    return [];
  }
  if (!Array.isArray(value)) throw new Invalid(`${key} must be a list`);
  return value;
}

export function dateField(body: Body, key: string, required = true): string {
  const value = stringField(body, key, required);
  if (!required && value === '') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Invalid(`${key} must be a date in YYYY-MM-DD form`);
  }
  return value;
}

export function instantField(body: Body, key: string, required = true): string {
  const value = stringField(body, key, required);
  if (!required && value === '') return '';
  if (Number.isNaN(Date.parse(value))) throw new Invalid(`${key} must be an instant`);
  return value;
}

export function refuseTypedFigures(body: Body, keys: string[]): void {
  for (const key of keys) {
    if (body[key] !== undefined) throw new Invalid(`${key} is derived by the system and cannot be supplied`);
  }
}

export function refuse(status: number, rule: string, detail: string, extra: Body = {}): never {
  throw new Refusal(status, rule, detail, extra);
}

export function notFound(kind: string, reference: string): never {
  throw new Refusal(404, `${kind}_not_found`, `${kind} ${reference} is not on record`);
}
