import type { Context } from 'hono';
import { log } from './config.js';

export class HttpError extends Error {
  status: number;
  fields?: Record<string, string>;
  code: string;
  constructor(status: number, message: string, opts: { fields?: Record<string, string>; code?: string } = {}) {
    super(message);
    this.status = status;
    this.fields = opts.fields;
    this.code = opts.code ?? (status === 404 ? 'not_found' : status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : 'bad_request');
  }
}

export const bad = (message: string, fields?: Record<string, string>) => new HttpError(400, message, { fields, code: 'bad_request' });
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, message, { code: 'unauthorized' });
export const forbidden = (message = 'You may not do that.') => new HttpError(403, message, { code: 'forbidden' });
export const notFound = (message = 'We could not find that page.') => new HttpError(404, message, { code: 'not_found' });
export const full = (message: string) => new HttpError(409, message, { code: 'event_full' });
export const tooMany = (message: string) => new HttpError(429, message, { code: 'rate_limited' });

export function errorHandler(err: unknown, c: Context) {
  if (err instanceof HttpError) {
    if (err.status >= 500) log('http_error', { status: err.status, message: err.message });
    const body: Record<string, unknown> = { message: err.message, code: err.code };
    if (err.fields) body.fields = err.fields;
    return c.json(body, err.status as 400);
  }
  const message = err instanceof Error ? err.message : String(err);
  const pgCode = (err as { code?: string } | null)?.code;
  if (pgCode === 'GATHER_EVENT_FULL') {
    return c.json({ message: 'This event just filled up.', code: 'event_full' }, 409);
  }
  log('unhandled_error', { message, stack: err instanceof Error ? err.stack : undefined });
  return c.json({ message: 'Something went wrong on our side. Try again in a moment.', code: 'internal' }, 500);
}
