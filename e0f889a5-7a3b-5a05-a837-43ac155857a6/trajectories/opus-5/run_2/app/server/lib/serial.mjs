// A serial is exactly twelve characters: two letters of model code, two digits of
// year, two digits of production week, then six characters from an alphabet that
// omits I, O, 0 and 1 because those are misread off an engraved underside.
export const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SERIAL_RE = new RegExp(`^(VA|VC)\\d{2}\\d{2}[${SERIAL_ALPHABET}]{6}$`);

export const MODEL_CODES = { VA: 'flagship', VC: 'compact' };

export function normaliseSerial(input) {
  return String(input ?? '').replace(/[\s-]/g, '').toUpperCase();
}

/** A serial that does not match the shape is refused before any lookup happens. */
export function isValidSerial(input) {
  return SERIAL_RE.test(normaliseSerial(input));
}

/** Grouped as it is typed, stored unformatted. */
export function groupSerial(serial) {
  const s = normaliseSerial(serial);
  return s.replace(/(.{4})(?=.)/g, '$1-');
}

/** Compare dotted version strings numerically, so 6.11 is above 6.9. */
export function compareVersions(a, b) {
  const pa = String(a ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b ?? '').split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
