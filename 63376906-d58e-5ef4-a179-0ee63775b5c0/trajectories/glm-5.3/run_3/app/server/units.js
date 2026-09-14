// Arithmetic units: every figure is an integer in its fixed unit. Floor, never round.
export const ZERO64 = '0'.repeat(64);
export const FLOOR = (n) => Math.floor(n);

export function dryMass(netG, moistureBp) { return Math.floor((netG * (10000 - moistureBp)) / 10000); }
export function creditGranted(dryMassG, factorBp) { return Math.floor((dryMassG * factorBp) / 10000); }
export function contentBp(attachedG, lotMassG) { return Math.floor((attachedG * 10000) / lotMassG); }
export function shareBp(partG, totalG) { return Math.floor((partG * 10000) / totalG); }
export function factorBp(outG, inG) { return inG > 0 ? Math.floor((outG * 10000) / inG) : null; }
export function blendContent(massA, contentA, massB, contentB) {
  const t = massA + massB;
  if (t <= 0) return 0;
  return Math.floor((massA * contentA + massB * contentB) / t);
}
export function requiredRemaining(deliveredKg, committedKg, floorBp, runningContentBp) {
  const remKg = committedKg - deliveredKg;
  if (remKg <= 0) return floorBp;
  const need = floorBp * committedKg * 1000 - runningContentBp * deliveredKg * 1000;
  return Math.floor(need / (remKg * 1000));
}
export const catIsClaimable = (c) => c === 'post_consumer' || c === 'pre_consumer';
export const integerOnly = (v) => Number.isInteger(v);
