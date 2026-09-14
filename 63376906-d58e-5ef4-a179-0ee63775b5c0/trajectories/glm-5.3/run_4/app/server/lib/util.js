import crypto from 'node:crypto';

export function nowIso() {
  return new Date().toISOString();
}

export function sha256(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

export function hashBody(s) {
  return sha256(String(s));
}

export function floorDiv(a, b) {
  if (b === 0) throw new Error('division_by_zero');
  return Math.floor(a / b);
}

export function dryMass(net_g, moisture_bp) {
  return floorDiv(net_g * (10000 - moisture_bp), 10000);
}

export function creditGranted(dry_g, factor_bp) {
  return floorDiv(dry_g * factor_bp, 10000);
}

export function contentBp(attached_g, lot_mass_g) {
  return floorDiv(attached_g * 10000, lot_mass_g);
}

export function ref(prefix, pad = 4) {
  return prefix + '-' + crypto.randomBytes(4).toString('hex').toUpperCase().padStart(pad, '0');
}

export function isEmail(s) {
  return typeof s === 'string' && s.includes('@') && s.length > 3;
}
