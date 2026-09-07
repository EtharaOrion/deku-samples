import { randomUUID } from 'node:crypto';

/** Structured logs to stdout, one line of JSON per request. */
export function log(fields) {
  try {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...fields })}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'log serialise failed' })}\n`);
  }
}

export const newRequestId = () => randomUUID();
