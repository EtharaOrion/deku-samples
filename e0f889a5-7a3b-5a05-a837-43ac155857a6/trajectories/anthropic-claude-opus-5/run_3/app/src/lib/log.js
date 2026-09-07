import crypto from 'node:crypto';

/** A request identifier generated at the edge of the request. */
export function newRequestId() {
  return 'req_' + crypto.randomBytes(9).toString('base64url');
}

/**
 * Structured logs to stdout, one line of JSON per request, carrying the method,
 * the route, the status, the elapsed milliseconds and the request_id. The same
 * request_id is returned in the body of every error response.
 */
export function logRequest({ method, route, status, ms, requestId, extra }) {
  const line = {
    ts: new Date().toISOString(),
    level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
    msg: 'request',
    request_id: requestId,
    method,
    route,
    status,
    duration_ms: Math.round(ms),
    ...(extra || {}),
  };
  process.stdout.write(JSON.stringify(line) + '\n');
}

export function logEvent(msg, fields = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level: 'info', msg, ...fields }) + '\n',
  );
}

export function logError(msg, fields = {}) {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg, ...fields }) + '\n',
  );
}
