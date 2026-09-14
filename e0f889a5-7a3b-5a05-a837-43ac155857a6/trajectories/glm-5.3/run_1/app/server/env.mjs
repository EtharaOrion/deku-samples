import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const env = {
  get databaseUrl() { return process.env.DATABASE_URL || process.env.DB_URL; },
  /** The container-internal listen port. The port mapping is
   *  ${APP_PUBLIC_PORT}:4173, so the public port is what the outside world uses
   *  and the internal port is what we bind; APP_INTERNAL_PORT wins so a public
   *  mapping can never move the listener. */
  get port() {
    const p = process.env.APP_INTERNAL_PORT || 4173;
    return Number(p);
  },
  get host() { return '0.0.0.0'; },
  get publicUrl() { return process.env.APP_PUBLIC_URL || `http://localhost:${this.port}`; },
  smtp: {
    get host() { return process.env.SMTP_HOST || ''; },
    get port() { return Number(process.env.SMTP_PORT || 25); },
    get user() { return process.env.SMTP_USER || ''; },
    get pass() { return process.env.SMTP_PASS || ''; },
  },
  kb: {
    get url() { return (process.env.PAYMENTS_API_URL || '').replace(/\/+$/, ''); },
    get key() { return process.env.PAYMENTS_API_KEY || ''; },
    get secret() { return process.env.PAYMENTS_API_SECRET || ''; },
    get user() { return process.env.PAYMENTS_ADMIN_USER || ''; },
    get pass() { return process.env.PAYMENTS_ADMIN_PASSWORD || ''; },
  },
};

export const TOKEN_TTL_S = 60 * 60 * 12;
const SECRET = process.env.TOKEN_SECRET || (env.databaseUrl || 'vela') + '::vela-token-secret';

export function newId(bytes = 16) { return randomBytes(bytes).toString('base64url'); }
export function newRequestId() { return randomBytes(8).toString('hex'); }

export function hashToken(t) { return createHmac('sha256', SECRET).update(String(t)).digest('hex'); }
export function sha256(s) { return createHash('sha256').update(String(s)).digest('hex'); }

/** Deterministic, unguessable order access token: no storage needed beyond its hash. */
export function orderAccessToken(orderId, number) {
  const sig = createHmac('sha256', SECRET).update(`order-access:${orderId}:${number}`).digest('base64url').slice(0, 32);
  return `${orderId}-${sig}`;
}

export function signToken(payload) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S };
  const b = Buffer.from(JSON.stringify(body)).toString('base64url');
  const sig = createHmac('sha256', SECRET).update(b).digest('base64url');
  return `${b}.${sig}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [b, sig] = token.split('.');
  if (!b || !sig) return null;
  let want;
  try { want = createHmac('sha256', SECRET).update(b).digest('base64url'); } catch { return null; }
  const a = Buffer.from(sig), w = Buffer.from(want);
  if (a.length !== w.length || !timingSafeEqual(a, w)) return null;
  try {
    const body = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch { return null; }
}

export const SERIAL_RE = /^(VA|VC)\d{2}(?!00)[0-9]{2}[2-9A-HJ-NP-Z]{6}$/;

export function validSerial(s) {
  return typeof s === 'string' && SERIAL_RE.test(s.trim().toUpperCase());
}

export function normalizeSerial(s) { return String(s || '').trim().toUpperCase(); }

/** djb2-ish base64 opaque cursor over a stable integer key. */
export function encodeCursor(id) {
  return Buffer.from(`k:${id}`).toString('base64url');
}
export function decodeCursor(c) {
  if (!c || typeof c !== 'string') return null;
  try {
    const s = Buffer.from(c, 'base64url').toString('utf8');
    const m = /^k:(\d+)$/.exec(s);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

/** page_size default 20, cap 100, above the cap is refused naming the cap. */
export function pageSize(q, def = 20, cap = 100) {
  const raw = q.get('page_size') ?? q.get('limit') ?? q.get('per_page');
  if (raw === null || raw === undefined || raw === '') return { size: def };
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    return { size: def };
  }
  if (n > cap) {
    return { error: `page_size must be 100 or less. ${raw} is above the cap of 100.` };
  }
  return { size: n };
}

export function minorToDollars(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0;
  const a = Math.abs(n);
  return `${neg ? '-' : ''}$${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

export function minorToDecimalString(minor) {
  const n = Math.trunc(Number(minor) || 0);
  const neg = n < 0 ? '-' : '';
  const a = Math.abs(n);
  return `${neg}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
}

export function cmpVersion(a, b) {
  const pa = String(a || '').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function nowIso() { return new Date().toISOString(); }

export function utcDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().slice(0, 10);
}
