import { createHash, randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Arithmetic. Every derived integer in this product is floored, never rounded.
// ---------------------------------------------------------------------------

export function fdiv(numerator, denominator) {
  if (denominator === 0) return 0;
  return Math.floor(Number(numerator) / Number(denominator));
}

export function dryMass(net_g, moisture_bp) {
  return fdiv(net_g * (10000 - moisture_bp), 10000);
}

export function creditGranted(dry_mass_consumed_g, factor_bp) {
  return fdiv(dry_mass_consumed_g * factor_bp, 10000);
}

export function contentBp(credit_attached_g, lot_mass_g) {
  return fdiv(credit_attached_g * 10000, lot_mass_g);
}

export function shareBp(part_mass_g, total_mass_g) {
  return fdiv(part_mass_g * 10000, total_mass_g);
}

export function weightedContentBp(mass_a, content_a, mass_b, content_b) {
  return fdiv(mass_a * content_a + mass_b * content_b, mass_a + mass_b);
}

export const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

// ---------------------------------------------------------------------------
// References, digests, dates
// ---------------------------------------------------------------------------

let counters = new Map();
export function ref(prefix) {
  const n = (counters.get(prefix) || 0) + 1;
  counters.set(prefix, n);
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().slice(0, 4).toUpperCase();
  return `${prefix}-${stamp}${rand}${n}`;
}

export function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

export const ZERO_DIGEST = '0'.repeat(64);

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function isoDate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

export function isoStamp(d) {
  if (!d) return null;
  return new Date(d).toISOString();
}

export function monthsBetween(fromISO, toISO) {
  const a = new Date(fromISO + 'T00:00:00Z');
  const b = new Date(toISO + 'T00:00:00Z');
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
    + (b.getUTCDate() >= a.getUTCDate() ? 0 : -1);
}

export function addMonths(dateISO, months) {
  const d = new Date(dateISO + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromISO, toISO) {
  const a = Date.parse(fromISO + 'T00:00:00Z');
  const b = Date.parse(toISO + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

export class HttpError extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : body.error || 'error');
    this.status = status;
    this.body = typeof body === 'string' ? { error: body } : body;
  }
}

export const fail = (status, body) => {
  throw new HttpError(status, body);
};
