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
