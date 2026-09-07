// Every derived integer in this product is floored, never rounded and never carried at half.
// A claim rounded up is a claim the ledger cannot support, and it compounds across four hops.

export const BP = 10000;

export function floorDiv(numerator, denominator) {
  if (denominator === 0) return 0;
  return Math.floor(numerator / denominator);
}

/** dry mass = net_g * (10000 - moisture_bp) / 10000, floored */
export function dryMass(netG, moistureBp) {
  return floorDiv(netG * (BP - moistureBp), BP);
}

/** credit granted at a consumption = dry_mass_consumed_g * factor_bp / 10000, floored */
export function creditFromDryMass(dryMassG, factorBp) {
  return floorDiv(dryMassG * factorBp, BP);
}

/** recycled content = credit_attached_g * 10000 / lot_mass_g, floored */
export function contentBp(creditAttachedG, lotMassG) {
  if (!lotMassG) return 0;
  return floorDiv(creditAttachedG * BP, lotMassG);
}

/** byproduct share = byproduct_mass_g * 10000 / total_output_mass_g, floored */
export function shareBp(byproductMassG, totalOutputMassG) {
  if (!totalOutputMassG) return 0;
  return floorDiv(byproductMassG * BP, totalOutputMassG);
}

/** conversion factor = derived_out_g * 10000 / derived_in_g, floored */
export function factorBp(derivedOutG, derivedInG) {
  if (!derivedInG) return 0;
  return floorDiv(derivedOutG * BP, derivedInG);
}

/** mass-weighted content = (mass_a*content_a + mass_b*content_b) / (mass_a+mass_b), floored */
export function blendedContentBp(massA, contentA, massB, contentB) {
  const total = massA + massB;
  if (!total) return 0;
  return floorDiv(massA * contentA + massB * contentB, total);
}

/** carry-over ceiling = credits_in_g * carry_over_limit_bp / 10000, floored */
export function carryOverCeiling(creditsInG, limitBp) {
  return floorDiv(creditsInG * limitBp, BP);
}

/** the average the remaining volume must reach for a contract floor to be met */
export function requiredRemainingBp(committedKg, floorBp, deliveredKg, runningContentBp) {
  const remaining = committedKg - deliveredKg;
  if (remaining <= 0) return 0;
  const needed = committedKg * floorBp - deliveredKg * runningContentBp;
  if (needed <= 0) return 0;
  return floorDiv(needed, remaining);
}

/** a proportion of a mass, floored */
export function proportionOf(massG, bp) {
  return floorDiv(massG * bp, BP);
}

export function isInteger(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

/** No figure crosses the wire as a decimal and no route accepts one. */
export function requireInteger(value, field) {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  if (!isInteger(value)) {
    const err = new Error(`${field} must be an integer`);
    err.status = 400;
    err.body = { error: 'non_integer_quantity', field, rule: `${field} is an integer; no figure crosses the wire as a decimal` };
    throw err;
  }
  return value;
}
