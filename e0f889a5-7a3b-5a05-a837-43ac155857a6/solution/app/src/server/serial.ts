/** A serial is twelve characters: two letters of model code, two digits of year,
 *  two digits of production week, then six characters from an alphabet that omits
 *  I, O, 0 and 1 because those are misread off an engraved underside. */
export const SERIAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const SERIAL_LENGTH = 12;

export const MODEL_CODES: Record<string, string> = {
  VA: "flagship",
  VC: "compact",
};

const SHAPE = new RegExp(
  `^(VA|VC)([0-9]{2})(0[1-9]|[1-4][0-9]|5[0-2])([${SERIAL_ALPHABET}]{6})$`,
);

export function normaliseSerial(raw: unknown): string {
  return String(raw ?? "")
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** The shape is decided before any lookup happens, so a serial of the wrong
 *  shape never reaches the store. */
export function isWellFormedSerial(serial: string): boolean {
  return serial.length === SERIAL_LENGTH && SHAPE.test(serial);
}

export function serialGrouped(serial: string): string {
  const clean = normaliseSerial(serial);
  return [clean.slice(0, 4), clean.slice(4, 8), clean.slice(8, 12)].filter(Boolean).join(" ");
}
