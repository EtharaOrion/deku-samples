/** Every refusal is a client error carrying a stable code, a human message and
 *  the request id the log line for this request also carries. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export const badRequest = (code: string, message: string, detail?: Record<string, unknown>) =>
  new AppError(400, code, message, detail);

export const unauthorized = (message = "Sign in to continue.") =>
  new AppError(401, "unauthenticated", message);

export const forbidden = (message = "That is not yours.") =>
  new AppError(403, "forbidden", message);

export const notFound = (message = "That page does not exist.") =>
  new AppError(404, "not_found", message);

export const conflict = (code: string, message: string, detail?: Record<string, unknown>) =>
  new AppError(409, code, message, detail);

export const unprocessable = (code: string, message: string, detail?: Record<string, unknown>) =>
  new AppError(422, code, message, detail);

export const unavailable = (code: string, message: string, detail?: Record<string, unknown>) =>
  new AppError(503, code, message, detail);
