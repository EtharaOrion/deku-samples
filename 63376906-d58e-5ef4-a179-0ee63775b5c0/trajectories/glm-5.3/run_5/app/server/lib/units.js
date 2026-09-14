// Exact integer arithmetic. Every derived figure is floored, never rounded.
import crypto from 'node:crypto';

export function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function floorDiv(a, b) {
  return Math.floor(a / b);
}

// Dry mass = net_g * (10000 - moisture_bp) / 10000, floored.
export function computeDryMass(net_g, moisture_bp) {
  return floorDiv(net_g * (10000 - moisture_bp), 10000);
}

// Credit granted at a consumption = dry mass consumed * factor_bp / 10000, floored.
export function computeCredit(dry_mass_consumed_g, factor_bp) {
  return floorDiv(dry_mass_consumed_g * factor_bp, 10000);
}

// Recycled content = credit_attached_g * 10000 / lot_mass_g, floored.
export function computeContentBp(credit_attached_g, lot_mass_g) {
  if (lot_mass_g <= 0) return 0;
  return floorDiv(credit_attached_g * 10000, lot_mass_g);
}

export function computeShareBp(part_g, whole_g) {
  if (whole_g <= 0) return 0;
  return floorDiv(part_g * 10000, whole_g);
}

export function computeBlendContentBp(mass_a, content_a, mass_b, content_b) {
  const total = mass_a + mass_b;
  if (total <= 0) return 0;
  return floorDiv(mass_a * content_a + mass_b * content_b, total);
}

export function computeFactorBp(derived_in_g, derived_out_g) {
  if (derived_in_g <= 0) return null;
  return floorDiv(derived_out_g * 10000, derived_in_g);
}

export function requireInt(value, name) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw Object.assign(new Error(`${name} must be an integer`), { status: 400, code: 'not_an_integer', field: name });
  }
  return value;
}

export function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

// Canonical JSON: sorted keys, so a digest computed on write matches a digest
// recomputed on read regardless of how jsonb chose to store the object.
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}
