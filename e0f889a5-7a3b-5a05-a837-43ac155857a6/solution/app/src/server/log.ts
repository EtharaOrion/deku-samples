import { randomUUID } from "node:crypto";

/** One line of JSON per request on stdout, every line carrying the request_id
 *  that the reader is also shown in an error body. */
export function newRequestId(): string {
  return randomUUID();
}

type Line = Record<string, unknown>;

function write(level: string, fields: Line): void {
  process.stdout.write(
    JSON.stringify({ ts: new Date().toISOString(), level, ...fields }) + "\n",
  );
}

export function logRequest(fields: {
  request_id: string;
  method: string;
  route: string;
  status: number;
  duration_ms: number;
}): void {
  write("info", fields);
}

export function logEvent(event: string, fields: Line = {}): void {
  write("info", { event, ...fields });
}

export function logError(event: string, fields: Line = {}): void {
  write("error", { event, ...fields });
}
