import { log } from './util.js';

export type ApiError = { status: number; body: { message: string; field?: string } };

export class HttpError extends Error {
  status: number;
  field?: string;
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export function bad(message: string, field?: string): HttpError {
  return new HttpError(400, message, field);
}
export function denied(message = 'You may not do that.', status = 403): HttpError {
  return new HttpError(status, message);
}
export function notFound(message = 'Not found.'): HttpError {
  return new HttpError(404, message);
}
export function conflict(message: string, field?: string): HttpError {
  return new HttpError(409, message, field);
}

export function jsonError(c: { json: (b: unknown, status?: number) => Response }, err: unknown): Response {
  if (err instanceof HttpError) {
    const body: { message: string; field?: string } = { message: err.message };
    if (err.field) body.field = err.field;
    return c.json(body, err.status as 400);
  }
  log({ level: 'error', msg: 'unhandled', error: String(err), stack: (err as Error)?.stack });
  return c.json({ message: 'Something went wrong on our side. Please try again.' }, 500);
}


