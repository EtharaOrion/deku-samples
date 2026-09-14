import crypto from 'node:crypto';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const errors = {
  validation: (message = 'That did not work.') => new ApiError(400, 'invalid_request', message),
  required: (label) => new ApiError(400, 'field_required', `${label} is required.`),
  unauthorized: (message = 'You need to sign in first.') => new ApiError(401, 'unauthorized', message),
  forbidden: (message = 'You cannot do that.') => new ApiError(403, 'forbidden', message),
  notFound: (message = 'That page does not exist.') => new ApiError(404, 'not_found', message),
  conflict: (message, resource) => new ApiError(409, 'conflict', message),
  gone: (message) => new ApiError(410, 'gone', message),
  tooMany: (message = 'Too many attempts. Try again in a minute.') => new ApiError(429, 'rate_limited', message),
  pageSizeCap: (cap) => new ApiError(400, 'page_size_cap', `page_size must be ${cap} or lower. ${cap} is the most this list can return at once.`),
};

export function requestId() {
  return crypto.randomUUID();
}

export function errorBody(err, reqId) {
  return {
    error: {
      code: err.code || 'internal_error',
      message: err.message || 'Something went wrong at our end.',
      request_id: reqId,
    },
    request_id: reqId,
  };
}
