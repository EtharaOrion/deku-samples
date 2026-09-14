export class ApiError extends Error {
  constructor(status, body) {
    super((body && (body.error || body.message)) || "request failed");
    this.status = status;
    this.body = body || {};
  }
}

let sessionStore = null;

export function setSession(s) { sessionStore = s; }
export function getSession() { return sessionStore; }

export async function api(path, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  const method = (opts.method || "GET").toUpperCase();
  const hasBody = opts.body !== undefined && opts.body !== null;
  if (hasBody) headers["Content-Type"] = "application/json";
  const s = getSession();
  if (s && s.access_token && !headers.Authorization) headers.Authorization = "Bearer " + s.access_token;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await fetch("/api" + path, {
    method,
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  let body = null;
  const text = await res.text();
  if (text) { try { body = JSON.parse(text); } catch { body = { raw: text }; } }
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

export function randomKey() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fmtG(g) {
  if (g === null || g === undefined) return "—";
  return g.toLocaleString("en-GB") + " g";
}
export function fmtBp(bp) {
  if (bp === null || bp === undefined) return "—";
  return (bp / 100).toFixed(2).replace(/\.00$/, "") + "%";
}
export function fmtDate(d) {
  if (!d) return "—";
  return d.slice(0, 10);
}
export function fmtDateTime(d) {
  if (!d) return "—";
  return d.replace("T", " ").slice(0, 16) + "Z";
}
export function uid() { return "k" + Math.random().toString(36).slice(2, 12); }
