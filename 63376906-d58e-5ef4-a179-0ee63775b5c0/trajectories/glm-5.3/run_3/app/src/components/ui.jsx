import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Link } from '../lib/router.jsx';

export const Figure = ({ value, unit = 'g', mono = true }) => h('span', { class: mono ? 'mono' : '' }, typeof value === 'number' ? value.toLocaleString('en-GB') : '—', unit ? ' ' + unit : '');
export const Ident = ({ children }) => h('span', { class: 'mono' }, children);
export const StateWord = ({ children }) => h('span', { class: 'state' }, children);
export const Flag = ({ children }) => h('span', { class: 'flag' }, children);

export function Loading({ label = 'Loading' }) { return h('p', { class: 'loading', role: 'status' }, `${label}…`); }
export function Empty({ children }) { return h('div', { class: 'empty' }, children); }
export function Banner({ title, children }) {
  return h('div', { class: 'banner', role: 'alert' }, h('p', { class: 'label' }, title), children);
}
// A recycled-content percentage renders with its claim type. Always.
export function ContentWithClaim({ content_bp, claim_type }) {
  if (content_bp == null) return h('span', null, '—');
  return h('span', null,
    h('span', { class: 'mono' }, (content_bp / 100).toFixed(2), '% '),
    h('span', { class: 'label' }, claim_type ? claim_type.replace(/_/g, ' ') : ''));
}
// A carbon figure renders with boundary, method version and uncertainty. Always.
export function CarbonWithDeps({ value_mg_per_kg, boundary, method_version, uncertainty_bp }) {
  if (value_mg_per_kg == null) return h('span', null, '—');
  return h('span', null,
    h('span', { class: 'mono' }, value_mg_per_kg.toLocaleString('en-GB'), ' mg/kg '),
    h('span', { class: 'label' }, `${boundary} · ${method_version} · ±${(uncertainty_bp / 100).toFixed(2)}%`));
}
// A capacity figure renders with its confidence. Always.
export function CapacityWithConfidence({ kg, confidence }) {
  return h('span', null, h('span', { class: 'mono' }, kg.toLocaleString('en-GB'), ' kg/yr '), h('span', { class: 'label' }, confidence.replace(/_/g, ' ')));
}
export function useData(path, guard = true) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!guard) { setState({ loading: false, data: null, error: null }); return; }
    setState({ loading: true, data: null, error: null });
    fetch('/api' + path, { headers: getTokenHeaders() }).then(async (r) => {
      const data = await r.json().catch(() => null);
      if (!alive) return;
      setState({ loading: false, data: r.ok ? data : null, error: r.ok ? null : data });
    }).catch((e) => alive && setState({ loading: false, data: null, error: { error: 'network' } }));
    return () => { alive = false; };
  }, [path, guard, nonce]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}
import { getToken } from '../lib/api.js';
const getTokenHeaders = () => (getToken() ? { authorization: `Bearer ${getToken()}` } : {});

export function Meta({ title, description, noindex }) {
  useEffect(() => {
    if (title) document.title = title;
    let d = document.querySelector('meta[name="description"]');
    if (!d) { d = document.createElement('meta'); d.name = 'description'; document.head.appendChild(d); }
    if (description) d.content = description;
    let r = document.querySelector('meta[name="robots"]');
    if (noindex) { if (!r) { r = document.createElement('meta'); r.name = 'robots'; document.head.appendChild(r); } r.content = 'noindex'; }
    else if (r) r.remove();
  }, [title, description, noindex]);
  return null;
}
