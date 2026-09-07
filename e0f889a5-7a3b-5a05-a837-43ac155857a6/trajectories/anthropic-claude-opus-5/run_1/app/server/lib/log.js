// Structured logs: one line of JSON per request on stdout.
export function log(fields) {
  try {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), ...fields })}\n`);
  } catch {
    process.stdout.write(`${JSON.stringify({ ts: new Date().toISOString(), level: 'error', msg: 'log_serialise_failed' })}\n`);
  }
}

export const info = (msg, fields = {}) => log({ level: 'info', msg, ...fields });
export const warn = (msg, fields = {}) => log({ level: 'warn', msg, ...fields });
export const error = (msg, fields = {}) => log({ level: 'error', msg, ...fields });
