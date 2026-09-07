// The one rule that makes every figure exact.
//
// Every derived integer in this product is floored, never rounded and never
// carried at half. A claim rounded up is a claim the ledger cannot support, and
// the error compounds across four hops. Where a figure would fall between two
// integers, the lower one is the answer.
//
// This module holds no state, reads no database and is the only place division
// happens. Nothing else in the server divides.

/** Floor division that stays correct for negative numerators too.
 *  Math.floor is the definition, so -60000 * 526 / 10000 floors downward
 *  rather than toward zero: a byproduct credit line is negative and must not
 *  drift upward when its share is taken. */
export function floorDiv(numerator, denominator) {
  if (denominator === 0) throw new Error('division_by_zero');
  return Math.floor(numerator / denominator);
}

/** Dry mass is net_g * (10000 - moisture_bp) / 10000, floored.
 *  12345 g at 5000 bp is 6172 g, not 6173. */
export function dryMassG(netG, moistureBp) {
  return floorDiv(netG * (10000 - moistureBp), 10000);
}

/** Credit granted at a consumption is dry_mass_consumed_g * factor_bp / 10000,
 *  floored. */
export function creditG(dryMassConsumedG, factorBp) {
  return floorDiv(dryMassConsumedG * factorBp, 10000);
}

/** Recycled content is credit_attached_g * 10000 / lot_mass_g, floored.
 *  200000 g of claim on a lot of 300000 g is 6666 bp, not 6667. */
export function contentBp(creditAttachedG, lotMassG) {
  if (!lotMassG) return 0;
  return floorDiv(creditAttachedG * 10000, lotMassG);
}

/** A conversion factor is the arithmetic of a stated window, never a number
 *  somebody chose. */
export function factorFromWindow(derivedInG, derivedOutG) {
  if (!derivedInG) return null;
  return floorDiv(derivedOutG * 10000, derivedInG);
}

/** A byproduct's share is byproduct_mass_g * 10000 / total_output_mass_g,
 *  floored. 40000 of 760000 is 526 bp. */
export function shareBp(byproductMassG, totalOutputMassG) {
  if (!totalOutputMassG) return 0;
  return floorDiv(byproductMassG * 10000, totalOutputMassG);
}

/** A share of a figure, taken at a share in basis points, floored. */
export function applyShare(valueG, bp) {
  return floorDiv(valueG * bp, 10000);
}

/** The mass-weighted content of a blend, floored.
 *  400000 g at 9000 bp with 200000 g at 7500 bp is 8500 bp. */
export function blendedContentBp(massA, contentA, massB, contentB) {
  const total = massA + massB;
  if (!total) return 0;
  return floorDiv(massA * contentA + massB * contentB, total);
}

/** The carry-over settled at a close: credit still available carries forward
 *  only up to carry_over_limit_bp of the credit that entered the period, and
 *  the remainder expires rather than being absorbed silently. */
export function carryOver(creditsInG, availableG, limitBp) {
  const cap = floorDiv(creditsInG * limitBp, 10000);
  const carriedForwardG = Math.min(availableG, cap);
  return { carried_forward_g: carriedForwardG, expired_g: availableG - carriedForwardG, cap_g: cap };
}

/** The average the remaining contracted volume must reach for a contract to
 *  land on its floor, floored. Reported even when it exceeds 10000, because an
 *  unreachable floor is reported and never refused. */
export function requiredRemainingBp(committedKg, deliveredKg, runningContentBp, floorBp) {
  const remainingKg = committedKg - deliveredKg;
  if (remainingKg <= 0) return null;
  const neededTotal = committedKg * floorBp;
  const haveSoFar = deliveredKg * runningContentBp;
  return floorDiv(neededTotal - haveSoFar, remainingKg);
}

/** A running weighted content across several deliveries, floored. */
export function runningContentBp(deliveries) {
  let mass = 0;
  let weighted = 0;
  for (const d of deliveries) {
    mass += d.mass_kg;
    weighted += d.mass_kg * d.content_bp;
  }
  if (!mass) return 0;
  return floorDiv(weighted, mass);
}

/** Grams to kilograms, floored, for the capacity and contract surfaces. */
export function gToKg(g) {
  return floorDiv(g, 1000);
}

const CLAIM_STRENGTH = { physically_segregated: 3, controlled_blending: 2, mass_balance: 1 };

/** The weaker of two claim types. A blend takes the weaker, never the better. */
export function weakerClaimType(a, b) {
  return (CLAIM_STRENGTH[a] || 0) <= (CLAIM_STRENGTH[b] || 0) ? a : b;
}

const CERT_STRENGTH = { certified: 2, suspended: 1, not_certified: 0 };

export function weakerCertificationState(a, b) {
  return (CERT_STRENGTH[a] ?? 0) <= (CERT_STRENGTH[b] ?? 0) ? a : b;
}

/** No figure crosses the wire as a decimal and no route accepts one. This is
 *  the guard every mass and every basis-point input passes through. */
export function requireInteger(value, field) {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) value = Number(value);
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    const err = new Error(`${field} must be an integer`);
    err.status = 400;
    err.body = { error: 'integer_required', field, detail: `${field} is an integer; no figure crosses the wire as a decimal` };
    throw err;
  }
  return value;
}

export function requireNonNegativeInteger(value, field) {
  const n = requireInteger(value, field);
  if (n < 0) {
    const err = new Error(`${field} must not be negative`);
    err.status = 400;
    err.body = { error: 'negative_not_permitted', field };
    throw err;
  }
  return n;
}
