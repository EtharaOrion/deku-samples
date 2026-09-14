import { HttpError } from './auth.js';

export function requireSession(c) {
  const s = c.get('session');
  if (!s) throw new HttpError(401, 'session_required');
  return s;
}
