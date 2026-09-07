// Two uppercase letters of model code, two digits of year, two digits of
// production week, then six characters from an alphabet that omits I, O, 0 and
// 1 because those are misread off an engraved underside.
export const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SERIAL_RE = /^(VA|VC)\d{2}\d{2}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export const MODEL_CODES = { VA: 'Vela A1', VC: 'Vela Cricket' };

export function normaliseSerial(raw) {
  return String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Shape is checked before any lookup happens. */
export function isValidSerial(raw) {
  const s = normaliseSerial(raw);
  if (s.length !== 12) return false;
  return SERIAL_RE.test(s);
}

/** Grouped as it is typed, stored unformatted. */
export function groupSerial(raw) {
  const s = normaliseSerial(raw);
  return s.replace(/(.{4})(?=.)/g, '$1 ').trim();
}
