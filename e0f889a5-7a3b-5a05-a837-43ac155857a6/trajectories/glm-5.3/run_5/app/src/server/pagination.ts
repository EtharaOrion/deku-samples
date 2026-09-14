import type { Context } from 'hono';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PageSizeError extends Error {
  constructor(public named: number) {
    super(`page_size must be 100 or less. You asked for ${named}.`);
  }
}

/** Defaults to 20, caps at 100, and refuses a request naming a page above the cap. */
export function pageSize(c: Context, params: { page_size?: string; limit?: string }): number {
  const raw = params.page_size ?? params.limit;
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PAGE_SIZE;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw new PageSizeError(n);
  }
  if (n > MAX_PAGE_SIZE) {
    throw new PageSizeError(n);
  }
  return n;
}

/** A keyset cursor over a stable ordering key. Base64 of the last key seen. */
export function encodeCursor(key: number | string): string {
  return Buffer.from(String(key), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined | null): number | string | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const n = Number(raw);
    return Number.isFinite(n) && raw.trim() !== '' ? n : raw;
  } catch {
    return null;
  }
}

/** Slice by cursor and report whether a further page exists. */
export function keysetPage<T>(rows: T[], keyOf: (row: T) => number | string, size: number, cursor: number | string | null) {
  const start = cursor === null ? 0 : rows.findIndex((r) => keyOf(r) === cursor) + 1;
  const at = start < 0 ? 0 : start;
  const page = rows.slice(at, at + size);
  const hasMore = at + size < rows.length;
  const last = page.length > 0 ? keyOf(page[page.length - 1]) : null;
  return {
    data: page,
    has_more: hasMore,
    next_cursor: hasMore && last !== null ? encodeCursor(last) : null,
  };
}
