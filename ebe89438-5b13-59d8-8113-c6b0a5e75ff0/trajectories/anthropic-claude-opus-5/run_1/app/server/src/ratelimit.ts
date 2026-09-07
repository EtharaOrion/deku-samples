const WINDOW_MS = 60_000;
export const LIMIT = 10;

const buckets = new Map<string, number[]>();

/** Ten requests a minute per account, counted per named bucket. */
export function hit(key: string): { ok: boolean; limit: number; retryAfter: number } {
  const now = Date.now();
  const seen = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (seen.length >= LIMIT) {
    buckets.set(key, seen);
    return { ok: false, limit: LIMIT, retryAfter: Math.ceil((WINDOW_MS - (now - seen[0])) / 1000) };
  }
  seen.push(now);
  buckets.set(key, seen);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < WINDOW_MS)) buckets.delete(k);
  }
  return { ok: true, limit: LIMIT, retryAfter: 0 };
}
