import { Context } from 'hono';
import { logger } from './log.ts';

export class ApiError extends Error {
  status: number;
  body: Record<string, any>;
  constructor(status: number, message: string, extra: Record<string, any> = {}) {
    super(message);
    this.status = status;
    this.body = { message, ...extra };
  }
}

export const bad = (message: string, extra: Record<string, any> = {}) =>
  new ApiError(400, message, extra);
export const unauthorized = (message = 'Sign in to continue.') =>
  new ApiError(401, message);
export const forbidden = (message = 'You do not have access to do that.') =>
  new ApiError(403, message);
export const notFound = (message = 'Not found.') => new ApiError(404, message);
export const tooMany = (message: string, extra: Record<string, any> = {}) =>
  new ApiError(429, message, extra);

export function jsonOk(c: Context, data: unknown, status = 200, headers?: Record<string, string>) {
  return c.json(data, status, headers);
}

export function errorHandler(err: unknown, c: Context) {
  if (err instanceof ApiError) {
    return c.json(err.body, err.status as any);
  }
  const anyErr = err as any;
  if (anyErr && anyErr.code === '23505') {
    return c.json({ message: 'That address is already taken.' }, 400);
  }
  logger.error('unhandled', { path: c.req.path, message: (err as any)?.message, stack: (err as any)?.stack });
  return c.json({ message: 'Something went wrong on our side. Please try again.' }, 500);
}
