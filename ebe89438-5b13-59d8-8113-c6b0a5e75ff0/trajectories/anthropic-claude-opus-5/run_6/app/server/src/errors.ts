export class AppError extends Error {
  status: number;
  field?: string;
  code: string;
  extra?: Record<string, unknown>;
  constructor(status: number, message: string, opts: { field?: string; code?: string; extra?: Record<string, unknown> } = {}) {
    super(message);
    this.status = status;
    this.field = opts.field;
    this.code = opts.code || 'request_refused';
    this.extra = opts.extra;
  }
}

export const notFound = (msg = 'Page Not Found') => new AppError(404, msg, { code: 'not_found' });
export const denied = () => new AppError(403, 'You do not have access to this.', { code: 'forbidden' });
export const unauthenticated = () => new AppError(401, 'Sign in to continue.', { code: 'unauthenticated' });
export const invalid = (field: string, msg: string) => new AppError(422, msg, { field, code: 'invalid_field' });
export const refused = (msg: string, extra?: Record<string, unknown>) =>
  new AppError(409, msg, { code: 'refused', extra });
