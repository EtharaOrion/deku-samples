function originFrom(request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost) return `${forwardedProto || url.protocol.replace(":", "")}://${forwardedHost}`;
  return url.origin;
}
async function apiGet(request, path, init = {}) {
  const url = `${originFrom(request)}/api${path}`;
  const headers = {
    accept: "application/json",
    ...init.headers
  };
  const cookie = request.headers.get("cookie");
  if (cookie && !headers.cookie) headers.cookie = cookie;
  const requestId = request.headers.get("x-request-id");
  if (requestId) headers["x-request-id"] = requestId;
  try {
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body?.error || { code: "request_failed", message: "That did not work." }
      };
    }
    return { ok: true, status: res.status, data: body };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      error: { code: "network_error", message: "Something went wrong at our end.", detail: err?.message }
    };
  }
}
function sessionTokenFrom(request) {
  const cookie = request.headers.get("cookie") || "";
  const found = /(?:^|;\s*)vela_session=([^;]+)/.exec(cookie);
  return found ? decodeURIComponent(found[1]) : null;
}
function authHeaders(request) {
  const token = sessionTokenFrom(request);
  return token ? { authorization: `Bearer ${token}` } : {};
}
function formatMoney(minor, currency = "usd") {
  const n = Math.trunc(Number(minor) || 0);
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const symbol = currency.toLowerCase() === "usd" ? "$" : "";
  return `${negative ? "-" : ""}${symbol}${whole.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
}
function formatBytes(bytes) {
  return `${Number(bytes).toLocaleString("en-US")} bytes`;
}
function formatDate(value) {
  const d = typeof value === "string" ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export { apiGet as a, authHeaders as b, formatMoney as c, formatBytes as d, formatDate as f, originFrom as o, sessionTokenFrom as s };
