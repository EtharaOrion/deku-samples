/**
 * Server-side fetch helper used during SSR. Every route renders complete markup
 * on first paint, so the page reads its own API on the same origin before the
 * response is sent.
 */
export function originFrom(request: Request): string {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) return `${forwardedProto || url.protocol.replace(':', '')}://${forwardedHost}`;
  return url.origin;
}

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: { code: string; message: string; request_id?: string; [k: string]: unknown } };

export async function apiGet<T = any>(request: Request, path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  const url = `${originFrom(request)}/api${path}`;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  // Carry the caller's cookies so the cart and the session resolve identically.
  const cookie = request.headers.get('cookie');
  if (cookie && !headers.cookie) headers.cookie = cookie;
  const requestId = request.headers.get('x-request-id');
  if (requestId) headers['x-request-id'] = requestId;

  try {
    const res = await fetch(url, { ...init, headers });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: body?.error || { code: 'request_failed', message: 'That did not work.' },
      };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      error: { code: 'network_error', message: 'Something went wrong at our end.', detail: err?.message },
    };
  }
}

export function sessionTokenFrom(request: Request): string | null {
  const cookie = request.headers.get('cookie') || '';
  const found = /(?:^|;\s*)vela_session=([^;]+)/.exec(cookie);
  return found ? decodeURIComponent(found[1]) : null;
}

export function cartTokenFrom(request: Request): string | null {
  const cookie = request.headers.get('cookie') || '';
  const found = /(?:^|;\s*)vela_cart=([^;]+)/.exec(cookie);
  return found ? decodeURIComponent(found[1]) : null;
}

export function authHeaders(request: Request): Record<string, string> {
  const token = sessionTokenFrom(request);
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** `37800` -> `$378.00`. The browser never does floating point money either. */
export function formatMoney(minor: number, currency = 'usd'): string {
  const n = Math.trunc(Number(minor) || 0);
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.trunc(abs / 100);
  const cents = abs % 100;
  const symbol = currency.toLowerCase() === 'usd' ? '$' : '';
  return `${negative ? '-' : ''}${symbol}${whole.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  return `${Number(bytes).toLocaleString('en-US')} bytes`;
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string'
    ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
    : value;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}
