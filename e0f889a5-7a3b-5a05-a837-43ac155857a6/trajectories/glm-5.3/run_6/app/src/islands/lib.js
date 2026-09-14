// Client helpers for the islands. Money stays in minor units in the browser;
// this is the only place a decimal string is produced, for display alone.
export function formatUsd(minor) {
  const n = Number(minor || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}$${dollars.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  const n = Number(bytes || 0);
  return `${(n / 1000000).toFixed(1)} MB`;
}

export function groupSerial(serial) {
  const s = String(serial || '').toUpperCase();
  return s.length === 12 ? `${s.slice(0, 4)} ${s.slice(4, 8)} ${s.slice(8, 12)}` : s;
}

export const SERIAL_RE = /^(VA|VC)\d{4}[2-9A-HJ-NP-Z]{6}$/;

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin'
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const err = new Error((json && json.error && json.error.message) || 'That did not work.');
    err.status = res.status;
    err.code = json && json.error && json.error.code;
    err.payload = json;
    throw err;
  }
  return json;
}

export function storedToken() {
  try { return window.localStorage.getItem('vela_token'); } catch { return null; }
}

export function storeToken(token) {
  try {
    if (token) window.localStorage.setItem('vela_token', token);
    else window.localStorage.removeItem('vela_token');
  } catch { /* storage unavailable */ }
}
