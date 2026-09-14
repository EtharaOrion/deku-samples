export function fmtG(g) {
  if (g === null || g === undefined) return '—';
  return `${Number(g).toLocaleString('en-GB')} g`;
}

export function fmtBp(bp) {
  if (bp === null || bp === undefined) return '—';
  return `${(Number(bp) / 100).toFixed(2)} %`;
}

export function fmtDate(d) {
  if (!d) return '—';
  const iso = typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = iso.split('-');
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtCarbon(mg) {
  if (mg === null || mg === undefined) return '—';
  return `${(Number(mg) / 1000000).toLocaleString('en-GB', { maximumFractionDigits: 2 })} kg CO2e per kg`;
}

export function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export function fmtState(s) {
  return String(s || '').replace(/_/g, ' ');
}
