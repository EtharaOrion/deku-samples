import { badRequest } from './errors.js';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * A page size above the cap is refused with the cap named, rather than served
 * as a page quietly cut down to fit.
 */
export function readPageSize(url) {
  const raw =
    url.searchParams.get('page_size') ??
    url.searchParams.get('limit') ??
    url.searchParams.get('per_page');
  if (raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw badRequest('invalid_page_size', `page_size must be a whole number of at least 1 and at most ${MAX_PAGE_SIZE}.`);
  }
  if (n > MAX_PAGE_SIZE) {
    throw badRequest(
      'page_size_too_large',
      `page_size may not be above ${MAX_PAGE_SIZE}. You asked for ${n}.`,
      { max_page_size: MAX_PAGE_SIZE, requested: n },
    );
  }
  return n;
}

/**
 * A keyset cursor over a stable ordering key, so a list that receives new rows
 * between two reads never repeats a row and never skips one.
 */
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
    throw badRequest('invalid_cursor', 'That page reference is not one we issued.');
  }
}

/** Fetch pageSize+1 rows, then report data, next_cursor and has_more. */
export function buildPage(rows, pageSize, cursorOf) {
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const next = hasMore && data.length ? encodeCursor(cursorOf(data[data.length - 1])) : null;
  return { data, next_cursor: next, has_more: hasMore };
}
