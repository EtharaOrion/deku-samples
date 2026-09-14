// Structured logging: one JSON line per request on stdout, carrying a request_id
// generated at the edge of the request. The same request_id appears in every
// error response body.

import crypto from 'node:crypto';
import { logLine } from './db.js';

export function newRequestId() {
  return 'req_' + crypto.randomBytes(9).toString('base64url');
}

export function requestLog(reqId, method, route, status, startedMs, extra = {}) {
  logLine({
    level: 'info',
    msg: 'request',
    request_id: reqId,
    method,
    route,
    status,
    elapsed_ms: Date.now() - startedMs,
    ...extra,
  });
}

export function errorLog(reqId, msg, extra = {}) {
  logLine({ level: 'error', msg, request_id: reqId, ...extra });
}
