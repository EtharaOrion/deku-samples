// Every derived integer in this product is floored, never rounded and never
// carried at half. Where a figure would fall between two integers, the lower
// one is the answer.

export function floorDiv(numerator, denominator) {
  if (denominator === 0) return 0;
  const n = BigInt(Math.trunc(numerator));
  const d = BigInt(Math.trunc(denominator));
  let qq = n / d;
  if ((n % d !== 0n) && ((n < 0n) !== (d < 0n))) qq -= 1n;
  return Number(qq);
}

export const dryMassG = (net_g, moisture_bp) =>
  floorDiv(net_g * (10000 - moisture_bp), 10000);

export const creditGrantedG = (dry_mass_consumed_g, factor_bp) =>
  floorDiv(dry_mass_consumed_g * factor_bp, 10000);

export const contentBp = (credit_attached_g, lot_mass_g) =>
  lot_mass_g === 0 ? 0 : floorDiv(credit_attached_g * 10000, lot_mass_g);

export const shareBp = (part_g, total_g) =>
  total_g === 0 ? 0 : floorDiv(part_g * 10000, total_g);

export const factorFromWindow = (derived_in_g, derived_out_g) =>
  derived_in_g === 0 ? 0 : floorDiv(derived_out_g * 10000, derived_in_g);

export const blendedContentBp = (mass_a, content_a, mass_b, content_b) =>
  floorDiv(mass_a * content_a + mass_b * content_b, mass_a + mass_b);

export const carryForwardCapG = (credits_in_g, carry_over_limit_bp) =>
  floorDiv(credits_in_g * carry_over_limit_bp, 10000);

const CLAIM_STRENGTH = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };
export function weakerClaim(a, b) {
  return (CLAIM_STRENGTH[a] ?? 0) <= (CLAIM_STRENGTH[b] ?? 0) ? a : b;
}

const CERT_STRENGTH = { certified: 2, suspended: 1, not_certified: 0 };
export function weakerCertification(a, b) {
  return (CERT_STRENGTH[a] ?? 0) <= (CERT_STRENGTH[b] ?? 0) ? a : b;
}

// A running weighted content across many deliveries, floored.
export function runningContentBp(entries) {
  let mass = 0;
  let product = 0;
  for (const e of entries) {
    mass += e.mass_g;
    product += e.mass_g * e.content_bp;
  }
  return mass === 0 ? 0 : floorDiv(product, mass);
}

// The average the remaining volume must reach for the floor to still be met.
export function requiredRemainingBp(committed_g, floor_bp, delivered_g, delivered_content_bp) {
  const remaining = committed_g - delivered_g;
  if (remaining <= 0) return 0;
  const need = committed_g * floor_bp - delivered_g * delivered_content_bp;
  return floorDiv(need, remaining);
}
