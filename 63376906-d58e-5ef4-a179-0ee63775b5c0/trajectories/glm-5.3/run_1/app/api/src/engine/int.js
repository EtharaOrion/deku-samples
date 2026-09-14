// The engine layer: every derived integer is floored, never rounded.
// No screen computes a figure of its own and no route writes a computed figure into a record.

export const floorDiv = (a, b) => {
  const A = BigInt(a), B = BigInt(b);
  if (B === 0n) throw new Error('divide_by_zero');
  const q = (A < 0n) === (B < 0n) ? (A < 0n ? (-A) / (-B) : A / B) : -((A < 0n ? -A : A) / (B < 0n ? -B : B));
  return Number(q);
};

export const floorMulDiv = (a, mul, den) => Number((BigInt(a) * BigInt(mul)) / BigInt(den));

export const dryMass = (net_g, moisture_bp) => floorMulDiv(net_g, 10000 - moisture_bp, 10000);

export const creditGranted = (dry_mass_consumed_g, factor_bp) => floorMulDiv(dry_mass_consumed_g, factor_bp, 10000);

export const contentBp = (credit_attached_g, lot_mass_g) =>
  lot_mass_g === 0 ? 0 : floorDiv(BigInt(credit_attached_g) * 10000n, BigInt(lot_mass_g));

export const factorFromWindow = (derived_out_g, derived_in_g) =>
  derived_in_g === 0 ? 0 : floorMulDiv(derived_out_g, 10000, derived_in_g);

export const byproductShareBp = (byproduct_mass_g, total_output_mass_g) =>
  total_output_mass_g === 0 ? 0 : floorMulDiv(byproduct_mass_g, 10000, total_output_mass_g);

export const blendContent = (mass_a, content_a, mass_b, content_b) =>
  floorDiv(BigInt(mass_a) * BigInt(content_a) + BigInt(mass_b) * BigInt(content_b), BigInt(mass_a) + BigInt(mass_b));

export const requiredRemainingBp = (committed_kg, floor_bp, delivered_kg, running_content_bp) => {
  const remaining = committed_kg - delivered_kg;
  if (remaining <= 0) return floor_bp;
  const need = Number((BigInt(committed_kg) * BigInt(floor_bp) - BigInt(delivered_kg) * BigInt(running_content_bp)) / BigInt(remaining));
  return Math.max(0, need);
};
