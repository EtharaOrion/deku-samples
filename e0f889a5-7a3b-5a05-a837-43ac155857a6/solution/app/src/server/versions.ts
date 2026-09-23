/** Firmware versions are dotted numbers, so `6.11` is newer than `6.2` and older
 *  than `7.0`. Comparing them as strings gets both of those wrong. */
export function compareVersions(left: string | null | undefined, right: string | null | undefined): number {
  if (left == null && right == null) return 0;
  if (left == null) return -1;
  if (right == null) return 1;
  const a = String(left).split(".").map((part) => Number(part.replace(/[^0-9]/g, "")) || 0);
  const b = String(right).split(".").map((part) => Number(part.replace(/[^0-9]/g, "")) || 0);
  const width = Math.max(a.length, b.length);
  for (let i = 0; i < width; i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export function isNewer(candidate: string | null | undefined, current: string | null | undefined): boolean {
  return compareVersions(candidate, current) > 0;
}
