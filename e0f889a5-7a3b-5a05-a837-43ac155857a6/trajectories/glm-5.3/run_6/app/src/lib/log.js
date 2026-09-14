import { randomUUID } from 'node:crypto';

export function newRequestId() {
  return 'req_' + randomUUID().replace(/-/g, '').slice(0, 20);
}

export function logLine(fields) {
  const line = JSON.stringify(fields);
  process.stdout.write(line + '\n');
}

export function logRequest({ requestId, method, route, status, startedAt, extra = {} }) {
  const elapsed = Date.now() - startedAt;
  logLine({
    ts: new Date().toISOString(),
    level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
    request_id: requestId,
    method,
    route,
    status,
    elapsed_ms: elapsed,
    ...extra
  });
}

export function logEvent(event, fields = {}) {
  logLine({ ts: new Date().toISOString(), level: 'info', event, ...fields });
}

export function logError(event, fields = {}) {
  logLine({ ts: new Date().toISOString(), level: 'error', event, ...fields });
}
