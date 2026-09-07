// No figure is animated as it changes, because a percentage that counts up is
// briefly wrong. These are pure formatters and nothing here computes a figure:
// every number rendered arrives from the arithmetic layer already derived.

export const grams = (g) =>
  g === null || g === undefined ? '—' : `${Number(g).toLocaleString('en-GB')} g`;

export const kilograms = (kg) =>
  kg === null || kg === undefined ? '—' : `${Number(kg).toLocaleString('en-GB')} kg`;

export const basisPoints = (bp) =>
  bp === null || bp === undefined ? '—' : `${Number(bp).toLocaleString('en-GB')} bp`;

// A percentage is shown beside its basis points; both come from the server.
export const percentFromBp = (bp) => {
  if (bp === null || bp === undefined) return '—';
  const whole = Math.floor(Math.abs(bp) / 100);
  const frac = String(Math.abs(bp) % 100).padStart(2, '0');
  return `${bp < 0 ? '-' : ''}${whole}.${frac}%`;
};

export const mgPerKg = (v) =>
  v === null || v === undefined ? '—' : `${Number(v).toLocaleString('en-GB')} mg CO₂e/kg`;

export const kwh = (v) =>
  v === null || v === undefined ? '—' : `${Number(v).toLocaleString('en-GB')} kWh`;

export const date = (d) => (d ? String(d).slice(0, 10) : '—');

export const dateTime = (d) => {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  // Every timestamp carries its zone.
  return `${dt.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
};

export const words = (s) => String(s || '').replace(/_/g, ' ');

export const titleCase = (s) => {
  const t = words(s);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const hours = (h) =>
  h === null || h === undefined ? 'never sent' : `${Number(h).toLocaleString('en-GB')} h ago`;
