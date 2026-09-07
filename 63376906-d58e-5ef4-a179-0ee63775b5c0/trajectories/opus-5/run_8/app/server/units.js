// Every derived integer in this product is floored, never rounded.
// Integers are held as BigInt through the multiplication so four hops of
// grams times basis points can never lose a unit to a float.

export function floorDiv(numerator, denominator) {
  const n = BigInt(numerator);
  const d = BigInt(denominator);
  if (d === 0n) throw new Error('division_by_zero');
  let q = n / d;
  if (n % d !== 0n && (n < 0n) !== (d < 0n)) q -= 1n; // floor, not truncate
  return Number(q);
}

export const dryMass = (netG, moistureBp) =>
  floorDiv(BigInt(netG) * BigInt(10000 - moistureBp), 10000n);

export const creditGranted = (dryMassG, factorBp) =>
  floorDiv(BigInt(dryMassG) * BigInt(factorBp), 10000n);

export const contentBp = (creditAttachedG, lotMassG) =>
  lotMassG === 0 ? 0 : floorDiv(BigInt(creditAttachedG) * 10000n, BigInt(lotMassG));

export const shareBp = (partG, totalG) =>
  totalG === 0 ? 0 : floorDiv(BigInt(partG) * 10000n, BigInt(totalG));

export const applyBp = (value, bp) => floorDiv(BigInt(value) * BigInt(bp), 10000n);

export const factorFromWindow = (inG, outG) =>
  inG === 0 ? null : floorDiv(BigInt(outG) * 10000n, BigInt(inG));

export const weightedContentBp = (massA, contentA, massB, contentB) =>
  floorDiv(
    BigInt(massA) * BigInt(contentA) + BigInt(massB) * BigInt(contentB),
    BigInt(massA) + BigInt(massB),
  );

export const carryForward = (availableG, creditsInG, limitBp) => {
  const cap = applyBp(creditsInG, limitBp);
  const carried = Math.min(availableG, cap);
  return { carried_forward_g: carried, expired_g: availableG - carried };
};

// Every figure that crosses the wire is an integer. This catches a decimal
// before it reaches a column.
export function requireInteger(value, field) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    const err = new Error(`${field} must be an integer`);
    err.code = 'not_an_integer';
    err.field = field;
    throw err;
  }
  return value;
}
