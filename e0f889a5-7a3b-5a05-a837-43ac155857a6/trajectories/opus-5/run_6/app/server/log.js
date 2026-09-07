import crypto from 'node:crypto';

export function newRequestId() {
  return `req_${crypto.randomBytes(9).toString('hex')}`;
}

export function log(fields) {
  const line = { ts: new Date().toISOString(), ...fields };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export function logRequest({ requestId, method, route, status, elapsedMs, extra }) {
  log({
    level: status >= 500 ? 'error' : 'info',
    request_id: requestId,
    method,
    route,
    status,
    elapsed_ms: elapsedMs,
    ...(extra || {}),
  });
}
