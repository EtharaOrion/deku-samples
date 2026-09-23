/** Evaluates a CSS cubic-bezier timing function by Newton-Raphson, so the
 *  scroll-driven values land on the same curve the stylesheet names. */
export function cubicBezier(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
): (x: number) => number {
  const a = (one: number, two: number) => 1 - 3 * two + 3 * one;
  const b = (one: number, two: number) => 3 * two - 6 * one;
  const c = (one: number) => 3 * one;
  const curve = (t: number, one: number, two: number) =>
    ((a(one, two) * t + b(one, two)) * t + c(one)) * t;
  const slope = (t: number, one: number, two: number) =>
    3 * a(one, two) * t * t + 2 * b(one, two) * t + c(one);

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let pass = 0; pass < 6; pass += 1) {
      const d = slope(t, p1x, p2x);
      if (d === 0) break;
      t -= (curve(t, p1x, p2x) - x) / d;
    }
    return curve(t, p1y, p2y);
  };
}

export const easeDefault = cubicBezier(0.25, 0.1, 0.25, 1);

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function ramp(value: number, start: number, end: number): number {
  return clamp01((value - start) / (end - start));
}
