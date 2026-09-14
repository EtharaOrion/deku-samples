import crypto from 'crypto';

export const minorToDecimalString = (minor) => {
  const n = Number(minor);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

export const taxOf = (subtotalMinor) => Math.trunc(subtotalMinor / 10);

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const newRequestId = () => crypto.randomBytes(8).toString('hex');

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export const SERIAL_RE = /^(VA|VC)[0-9]{4}[2-9A-HJ-NP-Z]{6}$/;

export function serialModel(serial) {
  const s = (serial || '').toUpperCase();
  if (s.startsWith('VA')) return 'flagship';
  if (s.startsWith('VC')) return 'compact';
  return null;
}

export const parsePageSize = (raw, def = 20, cap = 100) => {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new ApiError(400, 'invalid_page_size', `page_size must be a positive integer. ${raw} is not.`);
  if (n > cap) throw new ApiError(400, 'page_size_exceeds_cap', `page_size is capped at ${cap}. ${n} is above the cap.`);
  return n;
};

export const cursorEncode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
export const cursorDecode = (raw) => {
  try { return JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8')); }
  catch { throw new ApiError(400, 'invalid_cursor', 'That cursor is not valid.'); }
};

export const compareVersion = (a, b) => {
  if (a === b) return 0;
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};
