// Integer arithmetic. Every derived integer in this product is floored,
// never rounded and never carried at half, because a claim rounded up is a
// claim the ledger cannot support.

export const floorDiv = (a, b) => Math.floor(a / b);

// dry mass is net_g * (10000 - moisture_bp) / 10000, floored
export const dryMassG = (net_g, moisture_bp) =>
  floorDiv(net_g * (10000 - moisture_bp), 10000);

// credit granted at a consumption is dry_mass_consumed_g * factor_bp / 10000, floored
export const creditGrantedG = (dry_mass_g, factor_bp) =>
  floorDiv(dry_mass_g * factor_bp, 10000);

// recycled content is credit_attached_g * 10000 / lot_mass_g, floored
export const contentBP = (credit_attached_g, lot_mass_g) =>
  lot_mass_g <= 0 ? 0 : floorDiv(credit_attached_g * 10000, lot_mass_g);

// mass-weighted content, floored
export const blendedBP = (mass_a, content_a, mass_b, content_b) =>
  mass_a + mass_b <= 0
    ? 0
    : floorDiv(mass_a * content_a + mass_b * content_b, mass_a + mass_b);

// a share of a run's output, floored
export const shareBP = (part_g, total_g) =>
  total_g <= 0 ? 0 : floorDiv(part_g * 10000, total_g);

// a conversion factor stated as its own window, floored
export const factorFromWindowBP = (derived_out_g, derived_in_g) =>
  derived_in_g <= 0 ? null : floorDiv(derived_out_g * 10000, derived_in_g);

// a carry-over limited remainder, floored
export const carriedForwardG = (available_g, credits_in_g, limit_bp) =>
  floorDiv(Math.min(available_g, credits_in_g) * limit_bp, 10000);

// the average content the remaining volume must reach, floored
export const requiredRemainingBP = (
  committed_kg,
  floor_bp,
  delivered_kg,
  running_content_bp
) => {
  const committed_g = committed_kg * 1000;
  const delivered_g = delivered_kg * 1000;
  const remaining_g = committed_g - delivered_g;
  if (remaining_g <= 0) return 0;
  const stillNeeded_g = floorDiv(committed_g * floor_bp, 10000) - floorDiv(
    delivered_g * running_content_bp,
    10000
  );
  if (stillNeeded_g <= 0) return 0;
  return floorDiv(stillNeeded_g * 10000, remaining_g);
};

export const sha256Hex = async (bytes) => {
  const c = globalThis.crypto;
  const h = await c.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

export const nowIso = () => new Date().toISOString();
