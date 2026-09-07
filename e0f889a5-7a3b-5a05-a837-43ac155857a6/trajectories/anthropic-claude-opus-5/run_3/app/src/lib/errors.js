/**
 * Every rejected call carries a stable machine-readable code, a human message
 * and the request_id. An invalid, unauthorized or out-of-state call is a client
 * error, never a 5xx and never a silent success.
 */
export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.extra = extra;
    // Tagged rather than identified by instanceof: the bundler may place this
    // module in more than one chunk, and a client error must never be reported
    // as a 5xx because two copies of the class did not match.
    this.isAppError = true;
  }
}

export function isAppError(err) {
  return Boolean(err && err.isAppError === true && typeof err.status === 'number');
}

export const badRequest = (code, message, extra) => new AppError(400, code, message, extra);
export const unauthorized = (message = 'Sign in to continue.', code = 'unauthorized') =>
  new AppError(401, code, message);
export const notFound = (message = 'That page does not exist.', code = 'not_found') =>
  new AppError(404, code, message);
export const conflict = (code, message, extra) => new AppError(409, code, message, extra);
export const unprocessable = (code, message, extra) => new AppError(422, code, message, extra);

export function errorBody(err, requestId) {
  if (isAppError(err)) {
    return {
      error: { code: err.code, message: err.message, request_id: requestId, ...err.extra },
      code: err.code,
      message: err.message,
      request_id: requestId,
      ...err.extra,
    };
  }
  return {
    error: {
      code: 'internal_error',
      message: `Something went wrong at our end. Reference ${requestId}.`,
      request_id: requestId,
    },
    code: 'internal_error',
    message: `Something went wrong at our end. Reference ${requestId}.`,
    request_id: requestId,
  };
}
