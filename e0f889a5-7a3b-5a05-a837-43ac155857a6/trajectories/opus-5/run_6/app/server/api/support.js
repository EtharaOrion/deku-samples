import { AppError, badRequest } from '../errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function pageSizeFrom(c) {
  const raw =
    c.req.query('page_size') ?? c.req.query('pageSize') ?? c.req.query('limit') ?? c.req.query('per_page') ?? null;
  if (raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('invalid_page_size', `page_size must be a whole number from 1 to ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest(
      'page_size_too_large',
      `page_size cannot exceed ${MAX_PAGE_SIZE}. You asked for ${n}.`,
      { max_page_size: MAX_PAGE_SIZE, requested: n },
    );
  }
  return n;
}

export function decodeCursor(c) {
  const raw = c.req.query('cursor');
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw badRequest('invalid_cursor', 'That cursor is not one we issued.');
  }
}

export function encodeCursor(key) {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function page(c, { data, hasMore, lastKey }) {
  return c.json({
    data,
    next_cursor: hasMore ? encodeCursor(lastKey) : null,
    has_more: Boolean(hasMore),
  });
}

export async function readJson(c) {
  try {
    const body = await c.req.json();
    if (body && typeof body === 'object') return body;
    return {};
  } catch {
    const form = await c.req.parseBody().catch(() => null);
    if (form) return form;
    throw new AppError(400, 'invalid_body', 'That did not work. Send a JSON body.');
  }
}
