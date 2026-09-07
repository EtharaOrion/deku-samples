// Every derived integer in this product is floored, never rounded.
export function floorDiv(numerator, denominator) {
  if (Number(denominator) === 0) return 0;
  return Math.floor(Number(numerator) / Number(denominator));
}

export function dryMass(netG, moistureBp) {
  return floorDiv(Number(netG) * (10000 - Number(moistureBp)), 10000);
}

export function creditGranted(dryMassG, factorBp) {
  return floorDiv(Number(dryMassG) * Number(factorBp), 10000);
}

export function contentBp(creditAttachedG, lotMassG) {
  if (!lotMassG) return 0;
  return floorDiv(Number(creditAttachedG) * 10000, Number(lotMassG));
}

export function shareBp(partMassG, totalMassG) {
  if (!totalMassG) return 0;
  return floorDiv(Number(partMassG) * 10000, Number(totalMassG));
}

export function weightedContentBp(massA, contentA, massB, contentB) {
  const total = Number(massA) + Number(massB);
  if (!total) return 0;
  return floorDiv(Number(massA) * Number(contentA) + Number(massB) * Number(contentB), total);
}

export function isInteger(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

// No figure crosses the wire as a decimal and no route accepts one.
export function requireInteger(value, field) {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number(value);
  if (!isInteger(value)) {
    const err = new Error(`${field} must be an integer`);
    err.status = 400;
    err.body = {
      error: 'non_integer_figure',
      field,
      detail: `${field} must be an integer; a decimal is never accepted`,
    };
    throw err;
  }
  return value;
}
