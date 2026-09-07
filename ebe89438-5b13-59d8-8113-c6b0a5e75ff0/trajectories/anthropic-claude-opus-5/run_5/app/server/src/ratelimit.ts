const WINDOW_MS = 60_000;
const buckets = new Map<string, number[]>();

export interface RateVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/** At most `limit` requests per minute per key. */
export function takeToken(key: string, limit = 10): RateVerdict {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    const retryAfter = Math.ceil((WINDOW_MS - (now - hits[0])) / 1000);
    return { allowed: false, limit, remaining: 0, retryAfterSeconds: Math.max(1, retryAfter) };
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= WINDOW_MS)) buckets.delete(k);
    }
  }
  return { allowed: true, limit, remaining: limit - hits.length, retryAfterSeconds: 0 };
}
