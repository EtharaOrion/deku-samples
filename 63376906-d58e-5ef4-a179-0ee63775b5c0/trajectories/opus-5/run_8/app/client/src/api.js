import { useEffect, useState } from 'preact/hooks';

const TOKEN_KEY = 'ravel.session';

export const readSession = () => {
  try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch { return null; }
};
export const writeSession = (s) => {
  if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s));
  else localStorage.removeItem(TOKEN_KEY);
};

export const idempotencyKey = () =>
  `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export async function api(path, { method = 'GET', body, key } = {}) {
  const headers = { 'content-type': 'application/json' };
  const session = readSession();
  if (session?.access_token) headers.authorization = `Bearer ${session.access_token}`;
  if (method !== 'GET') headers['idempotency-key'] = key || idempotencyKey();
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    const err = new Error(json?.message || json?.error || `Request failed with ${res.status}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// A surface waiting on data says it is loading; a refusal says what was
// refused and what would change it.
export function useApi(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    if (!path) { setState({ loading: false, data: null, error: null }); return () => {}; }
    api(path)
      .then((data) => { if (live) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (live) setState({ loading: false, data: null, error }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  return state;
}

// Nothing animates a number as it changes: a percentage that counts up is
// briefly wrong. These format, they do not tween.
export const grams = (g) =>
  typeof g === 'number' ? `${g.toLocaleString('en-GB')} g` : '—';
export const kilograms = (kg) =>
  typeof kg === 'number' ? `${kg.toLocaleString('en-GB')} kg` : '—';
export const basisPoints = (bp) =>
  typeof bp === 'number'
    ? `${Math.floor(bp / 100)}.${String(Math.abs(bp) % 100).padStart(2, '0')} per cent`
    : '—';
export const mgPerKg = (v) =>
  typeof v === 'number' ? `${v.toLocaleString('en-GB')} mg CO₂e/kg` : '—';
export const kwh = (v) => (typeof v === 'number' ? `${v.toLocaleString('en-GB')} kWh` : '—');
export const words = (s) => (s || '').replace(/_/g, ' ');
