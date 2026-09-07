import { badRequest } from './errors.mjs';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * A page size above the cap is refused with the cap named, rather than served as
 * a page quietly cut down to fit. `limit` is accepted as a spelling of page size.
 */
export function pageSizeFrom(c) {
  const raw = c.req.query('page_size') ?? c.req.query('limit') ?? c.req.query('per_page');
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('invalid_page_size', `page_size must be a whole number between 1 and ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest(
      'page_size_too_large',
      `page_size cannot be larger than ${MAX_PAGE_SIZE}. You asked for ${n}.`,
      { max_page_size: MAX_PAGE_SIZE, requested: n },
    );
  }
  return n;
}

/** An opaque keyset cursor over a stable ordering key: never repeats, never skips. */
export function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const v = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (v === null || typeof v !== 'object') throw new Error('bad shape');
    return v;
  } catch {
    throw badRequest('invalid_cursor', 'That page reference is not valid. Start from the first page.');
  }
}

/** Fetch pageSize + 1 rows, then report whether a further page exists. */
export function buildPage(rows, pageSize, cursorOf) {
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const next = hasMore && data.length ? encodeCursor(cursorOf(data[data.length - 1])) : null;
  return { data, next_cursor: next, has_more: hasMore };
}
