import { AppError } from '../errors.js';

// A small fixed-window limiter over the sign-in and sign-up routes, so a
// password cannot be ground down. It holds counters only, never state a page
// reads back, and it is scoped to this process on purpose.
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = Number(process.env.AUTH_ATTEMPTS_PER_MINUTE || 20);
const windows = new Map();

function relative(ms) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds <= 1) return 'in a second';
  if (seconds < 60) return `in ${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? 'in a minute' : `in ${minutes} minutes`;
}

export function take(key) {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new AppError(429, 'too_many_attempts', `Too many attempts. Try again ${relative(entry.resetAt - now)}.`);
  }
}

// Keep the map from growing without bound.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of windows) if (now >= v.resetAt) windows.delete(k);
}, WINDOW_MS).unref();
