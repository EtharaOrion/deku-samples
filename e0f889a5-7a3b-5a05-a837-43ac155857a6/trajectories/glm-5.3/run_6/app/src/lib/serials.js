// Serial numbers and firmware version comparison.

export const SERIAL_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const SERIAL_RE = /^(VA|VC)\d{4}[2-9A-HJ-NP-Z]{6}$/;

export function serialLooksValid(serial) {
  return typeof serial === 'string' && SERIAL_RE.test(serial.trim().toUpperCase());
}

export function normaliseSerial(serial) {
  return String(serial || '').trim().toUpperCase();
}

export function randomSerialTail(len, rng = Math.random) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += SERIAL_ALPHABET[Math.floor(rng() * SERIAL_ALPHABET.length)];
  }
  return out;
}

// "grouped as it is typed and stored unformatted": grouped for display only.
export function groupSerial(serial) {
  const s = normaliseSerial(serial);
  if (s.length !== 12) return s;
  return `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)}`;
}

// Version strings such as 7.2, 6.11, 1.4.0 compared numerically part by part.
export function compareVersions(a, b) {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function versionAtLeast(have, required) {
  if (!required) return true;
  if (!have) return false;
  return compareVersions(have, required) >= 0;
}
