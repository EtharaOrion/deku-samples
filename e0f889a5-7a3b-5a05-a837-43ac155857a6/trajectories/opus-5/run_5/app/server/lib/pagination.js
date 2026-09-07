import { badRequest } from './errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * A page size above the cap is refused with the cap named, rather than served
 * with a page quietly cut down to fit. `limit` is accepted as a spelling of it.
 */
export function pageSizeFrom(c) {
  const raw =
    c.req.query('page_size') ?? c.req.query('pageSize') ?? c.req.query('limit') ?? null;
  if (raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('invalid_page_size', `page_size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest(
      'page_size_too_large',
      `page_size cannot be above ${MAX_PAGE_SIZE}. You asked for ${n}.`,
      { max_page_size: MAX_PAGE_SIZE, requested: n },
    );
  }
  return n;
}

/** An opaque keyset cursor over a stable ordering key. Never an offset. */
export function encodeCursor(parts) {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('bad shape');
    return parsed;
  } catch {
    throw badRequest('invalid_cursor', 'That cursor is not one we issued. Ask for the first page again.');
  }
}

/**
 * Fetch pageSize + 1 rows to learn whether a further page exists, then hand back
 * the page with its cursor. keyOf builds the cursor from the last row on the page.
 */
export function buildPage(rows, pageSize, keyOf) {
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore && data.length ? encodeCursor(keyOf(data[data.length - 1])) : null;
  return { data, next_cursor: nextCursor, has_more: hasMore };
}
