import { badRequest } from './errors.mjs';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * A page size above the cap is refused with the cap named, rather than served
 * as a page quietly cut down to fit.
 */
export function pageSizeFrom(c) {
  const raw = c.req.query('page_size') ?? c.req.query('limit') ?? c.req.query('per_page');
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('invalid_page_size', 'Page size must be a whole number of at least 1.');
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest(
      'page_size_too_large',
      `Page size is capped at ${MAX_PAGE_SIZE}. Ask for ${MAX_PAGE_SIZE} or fewer.`,
      { max_page_size: MAX_PAGE_SIZE, requested: n },
    );
  }
  return n;
}

/**
 * The cursor is a keyset cursor over a stable ordering key rather than an offset,
 * so a list that receives new rows between two reads never repeats or skips one.
 */
export function encodeCursor(parts) {
  return Buffer.from(JSON.stringify(parts), 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('bad shape');
    return parsed;
  } catch {
    throw badRequest('invalid_cursor', 'That cursor is not one we issued. Start from the first page.');
  }
}

/** Fetch pageSize + 1 rows, then report has_more from the extra row. */
export function paginate(rows, pageSize, cursorOf) {
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const last = data[data.length - 1];
  return {
    data,
    has_more: hasMore,
    next_cursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
  };
}
