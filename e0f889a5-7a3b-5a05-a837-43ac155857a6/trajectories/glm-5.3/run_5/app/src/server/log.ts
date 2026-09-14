import { randomUUID } from 'node:crypto';

export function newRequestId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 16);
}

let silent = false;

/** Suppress request logging for health probes and other noise. */
export function logLine(obj: Record<string, unknown>): void {
  if (silent) return;
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n');
}

export function isQuietPath(path: string): boolean {
  return path === '/api/health' || path === '/favicon.ico';
}

type Fields = Record<string, unknown>;

export function logEvent(event: string, fields: Fields = {}): void {
  process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), event, ...fields }) + '\n');
}
