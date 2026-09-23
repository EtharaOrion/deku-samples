/** Money is an integer count of minor units everywhere, including here.
 *  No float arithmetic and no parsing of a formatted string. */
export function usd(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error("money must use integer minor units");
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(3, "0");
  const whole = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}$${whole}.${digits.slice(-2)}`;
}

export function grouped(count: number): string {
  return String(Math.trunc(count)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function bytes(size: number): string {
  return `${grouped(size)} bytes`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Dates arrive as UTC ISO strings and are rendered without a local shift. */
export function longDate(value: string | null | undefined): string {
  if (!value) return "";
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!parts) return value;
  const month = MONTHS[Number(parts[2]) - 1] ?? parts[2];
  return `${month} ${Number(parts[3])}, ${parts[1]}`;
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return "";
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!parts) return value;
  return `${parts[1]}-${parts[2]}-${parts[3]}`;
}

/** A serial is grouped for reading and stored unformatted. */
export function groupSerial(serial: string): string {
  return serial.replace(/(.{4})(?=.)/g, "$1 ");
}

export const RENDERABLE = ["flagship", "compact", "mount", "case", "cable"] as const;
export type Renderable = (typeof RENDERABLE)[number];

export function isRenderable(handle: string | null | undefined): handle is Renderable {
  return (RENDERABLE as readonly string[]).includes(String(handle ?? ""));
}

export function handleForSku(sku: string | null | undefined): Renderable | null {
  const value = String(sku ?? "").toUpperCase();
  if (value.startsWith("VELA-A1-")) return "flagship";
  if (value.startsWith("VELA-CRICKET-")) return "compact";
  if (value.startsWith("VELA-MOUNT-")) return "mount";
  if (value.startsWith("VELA-CASE")) return "case";
  if (value.startsWith("VELA-CABLE")) return "cable";
  return null;
}

/** The three camera finishes as materials for a render. The yellow finish is a
 *  desaturated material and never the accent. */
export const MATERIALS: Record<string, string> = {
  graphite: "#3a3c40",
  sand: "#c8bca1",
  yellow: "#d5d560",
};

export function materialFor(option: string | null | undefined): string | null {
  return MATERIALS[String(option ?? "").toLowerCase()] ?? null;
}

export function materialStyle(option: string | null | undefined): string | undefined {
  const colour = materialFor(option);
  return colour ? `--product-material: ${colour}` : undefined;
}

export const ARRANGER_ART = {
  src: "/images/arranger-hero-small.webp",
  width: 1266,
  height: 1020,
  alt: "The Arranger icon among the shapes the application draws.",
};

export function cartBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

export function isExpired(untilIso: string | null | undefined, now = new Date()): boolean {
  if (!untilIso) return false;
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(untilIso);
  if (!parts) return false;
  const until = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  return until < now.getTime();
}
