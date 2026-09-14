// Error shapes carry a stable machine-readable code, a human message and the
// request identifier, in every client error and in every failure page.

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const errors = {
  badRequest: (message, code = 'bad_request') => new ApiError(400, code, message),
  unauthorized: (message = 'Sign in to continue.', code = 'unauthorized') =>
    new ApiError(401, code, message),
  forbidden: (message = 'That did not work.', code = 'forbidden') => new ApiError(403, code, message),
  notFound: (message = 'That page does not exist.', code = 'not_found') =>
    new ApiError(404, code, message),
  conflict: (message, code = 'conflict', extra = {}) => new ApiError(409, code, message, extra),
  unprocessable: (message, code = 'unprocessable') => new ApiError(422, code, message),
  tooMany: (retryAfterSeconds, message) =>
    Object.assign(new ApiError(429, 'too_many_attempts', message), { retryAfterSeconds }),
  internal: (message = 'Something went wrong at our end.') => new ApiError(500, 'internal', message)
};

export function errorBody(err, requestId) {
  return {
    error: {
      code: err.code || 'internal',
      message: err.message || 'Something went wrong at our end.',
      request_id: requestId,
      ...(err.extra && Object.keys(err.extra).length ? err.extra : {})
    }
  };
}
