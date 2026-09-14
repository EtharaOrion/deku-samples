import type { Context } from 'hono';
import { randomUUID } from 'node:crypto';

export type ApiEnv = { Variables: { requestId: string } };

export function requestId(c: Context): string {
  return c.get('requestId') as string;
}

export function clientError(c: Context, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return c.json({ error: { code, message, request_id: requestId(c), ...extra } }, status as any);
}

export function conflict(c: Context, resource: string, message?: string) {
  return clientError(c, 409, 'conflict', message || `That ${resource} was already taken.`, { resource });
}

export function unauthorized(c: Context, message = 'You need to sign in first.') {
  return clientError(c, 401, 'unauthorized', message);
}

export function forbidden(c: Context, message = 'That did not work.') {
  return clientError(c, 403, 'forbidden', message);
}

export function notFound(c: Context, message = 'That page does not exist.') {
  return clientError(c, 404, 'not_found', message);
}

export function badRequest(c: Context, message: string, code = 'invalid') {
  return clientError(c, 400, code, message);
}

export function listResponse<T>(c: Context, data: T[], nextCursor: string | null, hasMore: boolean) {
  return c.json({ data, next_cursor: nextCursor, has_more: hasMore });
}

export function parsePagination(c: Context): { pageSize: number; cursor: string | null } {
  const url = new URL(c.req.url);
  const params = url.searchParams;
  const rawPageSize = params.get('page_size') ?? params.get('limit') ?? undefined;
  if (rawPageSize !== undefined && rawPageSize !== null && rawPageSize !== '') {
    const parsed = Number(rawPageSize);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new PaginationError(`page_size must be a positive whole number.`);
    }
    if (parsed > 100) {
      throw new PaginationError(`page_size is capped at 100.`);
    }
    return { pageSize: parsed, cursor: params.get('cursor') };
  }
  return { pageSize: 20, cursor: params.get('cursor') };
}

export class PaginationError extends Error {}

export function pageOf(total: number, pageSize: number): { pages: number } {
  return { pages: Math.ceil(total / pageSize) };
}
