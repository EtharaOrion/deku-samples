/** Compare dotted version strings such as 7.2 and 6.11 numerically. */
export function parse(v: string): number[] {
  return v.trim().split('.').map((p) => Number(p) || 0);
}

export function compare(a: string, b: string): number {
  const A = parse(a);
  const B = parse(b);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
