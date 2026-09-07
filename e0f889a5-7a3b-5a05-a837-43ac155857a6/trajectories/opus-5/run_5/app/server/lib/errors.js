/** A client error carrying a stable machine-readable code and a human message. */
export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (code, message, extra) => new AppError(400, code, message, extra);
export const unauthorized = (message = 'Sign in to continue.', code = 'unauthorized') =>
  new AppError(401, code, message);
export const forbidden = (message = 'That did not work.', code = 'forbidden') =>
  new AppError(403, code, message);
export const notFound = (message = 'That page does not exist.', code = 'not_found') =>
  new AppError(404, code, message);
export const conflict = (code, message, extra) => new AppError(409, code, message, extra);
export const unprocessable = (code, message, extra) => new AppError(422, code, message, extra);
