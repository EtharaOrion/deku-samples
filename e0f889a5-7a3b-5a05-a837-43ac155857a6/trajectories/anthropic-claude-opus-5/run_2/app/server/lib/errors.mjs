/**
 * Every error response carries a stable machine-readable code, a human message
 * and the request_id, which is the same value the structured log line carries.
 */
export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (code, message, extra) => new AppError(400, code, message, extra);
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'That did not work.') => new AppError(403, 'forbidden', message);
export const notFound = (message = 'That page does not exist.') => new AppError(404, 'not_found', message);
export const conflict = (code, message, extra) => new AppError(409, code, message, extra);
export const unprocessable = (code, message, extra) => new AppError(422, code, message, extra);

export function errorBody(err, requestId) {
  const status = err instanceof AppError ? err.status : 500;
  const code = err instanceof AppError ? err.code : 'internal_error';
  const message = err instanceof AppError
    ? err.message
    : `Something went wrong at our end. Reference ${requestId}.`;
  return {
    status,
    body: { error: { code, message, request_id: requestId, ...(err instanceof AppError ? err.extra : {}) } },
  };
}
