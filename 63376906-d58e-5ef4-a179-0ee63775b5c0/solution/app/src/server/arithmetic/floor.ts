/**
 * The only place a quotient is taken. Every derived integer in the system
 * (dry mass, content in basis points, shares, carry-over) is floored here,
 * never rounded, so the claim can only ever be understated.
 */
export function floorDivide(numerator: number, denominator: number): number {
  if (denominator === 0) throw new Error('floorDivide: denominator is zero');
  return Math.floor(numerator / denominator);
}

/** floor(part × scale / total) — content, shares and limits all take this shape. */
export function floorShare(part: number, total: number, scale: number): number {
  return floorDivide(part * scale, total);
}

export const BP_SCALE = 10000;
