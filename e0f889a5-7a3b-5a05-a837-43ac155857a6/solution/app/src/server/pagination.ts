import { badRequest } from "./errors";

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/** A page above the cap is refused with the cap named, never served quietly cut
 *  down to fit. `limit` is read as a page size so a caller writing `limit=500`
 *  is told the cap rather than handed 100 rows. */
export function readPageSize(params: URLSearchParams): number {
  const raw = params.get("page_size") ?? params.get("limit") ?? params.get("per_page");
  if (raw === null || raw === "") return PAGE_SIZE_DEFAULT;
  if (!/^[1-9]\d*$/.test(raw)) {
    throw badRequest("page_size_invalid", `page_size must be a whole number between 1 and ${PAGE_SIZE_MAX}.`);
  }
  const size = Number(raw);
  if (!Number.isSafeInteger(size)) {
    throw badRequest("page_size_invalid", `page_size must be a whole number between 1 and ${PAGE_SIZE_MAX}.`);
  }
  if (size > PAGE_SIZE_MAX) {
    throw badRequest(
      "page_size_too_large",
      `page_size is capped at ${PAGE_SIZE_MAX}. You asked for ${size}.`,
      { max: PAGE_SIZE_MAX, requested: size },
    );
  }
  return size;
}

/** A keyset cursor over a stable ordering key. Rows arriving between two reads
 *  never repeat a row and never skip one, which an offset cursor cannot promise. */
export function encodeCursor(key: (string | number)[]): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

export function decodeCursor(raw: string | null): (string | number)[] | null {
  if (!raw) return null;
  if (raw.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(raw)) {
    throw badRequest("cursor_invalid", "That page reference is not one we issued.");
  }
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      !Array.isArray(parsed) ||
      parsed.some((value) => typeof value !== "string" && typeof value !== "number")
    ) {
      throw new Error("invalid cursor shape");
    }
    return parsed;
  } catch {
    throw badRequest("cursor_invalid", "That page reference is not one we issued.");
  }
}

export type Page<T> = { data: T[]; next_cursor: string | null; has_more: boolean };

/** Read one extra row to learn whether a further page exists without counting. */
export function buildPage<T>(
  rows: T[],
  pageSize: number,
  keyOf: (row: T) => (string | number)[],
): Page<T> {
  const hasMore = rows.length > pageSize;
  const data = hasMore ? rows.slice(0, pageSize) : rows;
  const last = data[data.length - 1];
  return {
    data,
    next_cursor: hasMore && last !== undefined ? encodeCursor(keyOf(last)) : null,
    has_more: hasMore,
  };
}
