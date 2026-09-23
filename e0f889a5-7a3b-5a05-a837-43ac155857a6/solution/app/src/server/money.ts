/** Money is an integer count of minor units everywhere. Nothing here returns a
 *  float, and the only decimal produced is the string the billing platform reads. */

export const TAX_NUMERATOR = 10;
export const TAX_DENOMINATOR = 100;

export function taxOn(subtotalMinor: number): number {
  return Math.trunc((subtotalMinor * TAX_NUMERATOR) / TAX_DENOMINATOR);
}

function decimalParts(minor: number): { sign: string; whole: string; fraction: string } {
  if (!Number.isSafeInteger(minor)) throw new Error("money must be an integer minor-unit count");
  const sign = minor < 0 ? "-" : "";
  const digits = String(Math.abs(minor)).padStart(3, "0");
  return { sign, whole: digits.slice(0, -2), fraction: digits.slice(-2) };
}

/** `41580` reads `$415.80`. */
export function formatMinor(minor: number): string {
  const { sign, whole, fraction } = decimalParts(minor);
  return `${sign}$${whole}.${fraction}`;
}

/** `41580` reads `415.80`, which is the figure the billing platform stores. */
export function decimalMinor(minor: number): string {
  const { sign, whole, fraction } = decimalParts(minor);
  return `${sign}${whole}.${fraction}`;
}

export const PROTECTION_RUNGS = [
  { sku: "VELA-PROTECT-1", priceMinor: 98, from: 1, to: 9999 },
  { sku: "VELA-PROTECT-2", priceMinor: 298, from: 10000, to: 49999 },
  { sku: "VELA-PROTECT-3", priceMinor: 598, from: 50000, to: 99999 },
  { sku: "VELA-PROTECT-4", priceMinor: 1198, from: 100000, to: Number.MAX_SAFE_INTEGER },
] as const;

export type ProtectionRung = (typeof PROTECTION_RUNGS)[number];

export function rungFor(subtotalMinor: number): ProtectionRung | null {
  if (subtotalMinor < 1) return null;
  return PROTECTION_RUNGS.find((r) => subtotalMinor >= r.from && subtotalMinor <= r.to) ?? null;
}

export const DELIVERY_METHODS = [
  { name: "Standard", priceMinor: 0, window: "5 to 7 days" },
  { name: "Express", priceMinor: 2500, window: "2 days" },
] as const;

export function deliveryMethod(name: string | null | undefined) {
  if (!name) return null;
  return DELIVERY_METHODS.find((m) => m.name.toLowerCase() === String(name).toLowerCase()) ?? null;
}
