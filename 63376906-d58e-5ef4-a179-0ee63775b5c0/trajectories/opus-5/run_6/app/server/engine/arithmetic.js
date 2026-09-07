// The one rule that makes every figure exact: every derived integer is floored,
// never rounded and never carried at half. A claim rounded up is a claim the ledger
// cannot support, and it compounds across four hops.

export function floorDiv(numerator, denominator) {
  if (denominator === 0) return 0;
  const n = BigInt(Math.trunc(numerator));
  const d = BigInt(Math.trunc(denominator));
  let qout = n / d;
  if ((n % d !== 0n) && ((n < 0n) !== (d < 0n))) qout -= 1n;
  return Number(qout);
}

// dry mass = net_g * (10000 - moisture_bp) / 10000, floored
export function dryMass(netG, moistureBp) {
  return floorDiv(netG * (10000 - moistureBp), 10000);
}

// credit granted at a consumption = dry_mass_consumed_g * factor_bp / 10000, floored
export function creditGranted(dryMassConsumedG, factorBp) {
  return floorDiv(dryMassConsumedG * factorBp, 10000);
}

// recycled content = credit_attached_g * 10000 / lot_mass_g, floored
export function contentBp(creditAttachedG, lotMassG) {
  if (!lotMassG) return 0;
  return floorDiv(creditAttachedG * 10000, lotMassG);
}

// a byproduct's share = byproduct_mass_g * 10000 / total_output_mass_g, floored
export function shareBp(byproductMassG, totalOutputMassG) {
  if (!totalOutputMassG) return 0;
  return floorDiv(byproductMassG * 10000, totalOutputMassG);
}

// a conversion factor is the arithmetic of a stated window
export function factorFromWindow(derivedInG, derivedOutG) {
  if (!derivedInG) return null;
  return floorDiv(derivedOutG * 10000, derivedInG);
}

// mass-weighted content, floored
export function blendedContentBp(massA, contentA, massB, contentBValue) {
  const total = massA + massB;
  if (!total) return 0;
  return floorDiv(massA * contentA + massB * contentBValue, total);
}

// carry-over: credit still available carries forward only up to carry_over_limit_bp
// of the credit that entered the period; the remainder expires.
export function carryOver(creditsInG, availableG, limitBp) {
  const cap = floorDiv(creditsInG * limitBp, 10000);
  const carried = Math.min(availableG, cap);
  return { carried_forward_g: carried, expired_g: availableG - carried, cap_g: cap };
}

// the average the remaining volume must reach to meet a contract floor
export function requiredRemainingBp(committedKg, deliveredKg, runningContentBp, floorBp) {
  const remaining = committedKg - deliveredKg;
  if (remaining <= 0) return null;
  const needed = committedKg * floorBp - deliveredKg * runningContentBp;
  return floorDiv(needed, remaining);
}

export function isUnreachable(requiredBp) {
  return requiredBp !== null && requiredBp > 10000;
}

// running weighted content across deliveries, floored
export function runningContent(deliveries) {
  let mass = 0;
  let weighted = 0;
  for (const d of deliveries) {
    mass += d.mass_kg;
    weighted += d.mass_kg * d.content_bp;
  }
  if (!mass) return 0;
  return floorDiv(weighted, mass);
}
