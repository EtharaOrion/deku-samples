export const money = (minor, currency = 'USD') => {
  const n = Number(minor || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};
export const bytes = (n) => {
  const v = Number(n || 0);
  if (v >= 1024 * 1024 * 1024) return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  if (v >= 1024) return `${Math.round(v / 1024)} kB`;
  return `${v} B`;
};
export const longDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const shortDateTime = (d) => new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
export const orderStatusChip = (o) => {
  if (o.status === 'cancelled') return 'Cancelled';
  if (o.status === 'confirmed' && o.fulfilment_status === 'fulfilled') return 'Confirmed and fulfilled';
  if (o.status === 'confirmed') return 'Confirmed, not yet sent';
  return 'Being placed';
};
export const SERIAL_RE = /^(VA|VC)[0-9]{4}[2-9A-HJ-NP-Z]{6}$/;
export const groupSerial = (s) => {
  const v = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return [v.slice(0, 4), v.slice(4, 8), v.slice(8, 12)].filter(Boolean).join(' ');
};

export const compareVersion = (a, b) => {
  if (a === b) return 0;
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};
