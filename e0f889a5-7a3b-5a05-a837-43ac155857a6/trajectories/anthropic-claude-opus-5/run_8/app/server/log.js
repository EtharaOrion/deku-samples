import { randomUUID } from 'node:crypto';

export function newRequestId() {
  return `req_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

// One line of JSON per request on stdout.
export function logLine(fields) {
  try {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), ...fields }) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'log serialisation failed' }) + '\n');
  }
}
