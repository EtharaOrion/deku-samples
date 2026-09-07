export class AppError extends Error {
  status: number;
  field?: string;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, field?: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.field = field;
    this.extra = extra;
  }
}

export const badRequest = (message: string, field?: string, extra?: Record<string, unknown>) =>
  new AppError(400, message, field, extra);
export const unauthorized = (message = 'Sign in to continue.') => new AppError(401, message);
export const forbidden = (message = 'You do not have access to that.') => new AppError(403, message);
export const notFound = (message = 'Not found.') => new AppError(404, message);
export const conflict = (message: string, field?: string, extra?: Record<string, unknown>) =>
  new AppError(409, message, field, extra);
export const tooMany = (message: string, extra?: Record<string, unknown>) =>
  new AppError(429, message, undefined, extra);
