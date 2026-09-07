export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public field?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
  body() {
    return {
      message: this.message,
      ...(this.field ? { field: this.field } : {}),
      ...(this.extra ?? {}),
    };
  }
}

export const badRequest = (message: string, field?: string, extra?: Record<string, unknown>) =>
  new HttpError(400, message, field, extra);
export const unauthorized = (message = 'Sign in to continue.') => new HttpError(401, message);
export const forbidden = (message = 'This is not yours to change.') => new HttpError(403, message);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message: string, field?: string, extra?: Record<string, unknown>) =>
  new HttpError(409, message, field, extra);
export const tooMany = (message: string, extra?: Record<string, unknown>) =>
  new HttpError(429, message, undefined, extra);
