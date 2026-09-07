import { randomUUID } from 'node:crypto';

export function newRequestId() {
  return randomUUID();
}

/** One line of JSON per event on stdout. */
export function log(fields) {
  process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...fields })}\n`);
}

export function logRequest({ request_id, method, route, status, duration_ms, ...rest }) {
  log({ level: status >= 500 ? 'error' : 'info', msg: 'request', request_id, method, route, status, duration_ms, ...rest });
}
