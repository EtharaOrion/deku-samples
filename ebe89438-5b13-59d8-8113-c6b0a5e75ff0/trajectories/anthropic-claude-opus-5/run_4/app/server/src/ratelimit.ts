interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export const RATE_LIMIT = 10;
export const RATE_WINDOW_MS = 60_000;

/** Returns null when the call is allowed, or the seconds until the window resets. */
export function take(key: string, limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS): number | null {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (b.count >= limit) return Math.ceil((b.resetAt - now) / 1000);
  b.count += 1;
  return null;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 60_000).unref?.();
