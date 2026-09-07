// Every derived integer in this product is floored, never rounded and never
// carried at half. Arithmetic runs in BigInt so nothing is lost to a double.

export function floorDiv(a, b) {
  const A = BigInt(a);
  const B = BigInt(b);
  if (B === 0n) return 0;
  let qv = A / B;
  if (A % B !== 0n && (A < 0n) !== (B < 0n)) qv -= 1n; // floor, not truncate
  return Number(qv);
}

export function mulDiv(a, b, d) {
  return floorDiv(BigInt(a) * BigInt(b), d);
}

// dry mass = net_g * (10000 - moisture_bp) / 10000, floored
export function dryMass(net_g, moisture_bp) {
  return mulDiv(net_g, 10000 - moisture_bp, 10000);
}

// credit granted at a consumption = dry_mass_consumed_g * factor_bp / 10000, floored
export function creditFor(dry_mass_g, factor_bp) {
  return mulDiv(dry_mass_g, factor_bp, 10000);
}

// recycled content = credit_attached_g * 10000 / lot_mass_g, floored
export function contentBp(credit_attached_g, lot_mass_g) {
  if (!lot_mass_g) return 0;
  return mulDiv(credit_attached_g, 10000, lot_mass_g);
}

export function shareBp(part_g, total_g) {
  if (!total_g) return 0;
  return mulDiv(part_g, 10000, total_g);
}

export function isInt(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

// A route never accepts a decimal for a measured quantity.
export function requireInt(v, field) {
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return Number(v);
  if (!isInt(v)) {
    const e = new Error(`${field} must be an integer`);
    e.status = 400;
    e.body = { error: 'non_integer_quantity', field, detail: `${field} must be an integer; no figure crosses the wire as a decimal` };
    throw e;
  }
  return v;
}

// A timestamptz arrives from postgres as a Date and a date column as a string.
// This yields the calendar day of either, never a Date's own toString.
export function dayOf(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
