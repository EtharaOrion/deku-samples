import { useEffect, useRef, useState } from 'preact/hooks';

export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('in');
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { el.classList.add('in'); obs.disconnect(); }
    }, { threshold: 0.05 });
    obs.observe(el);
    // never hidden if the reader never scrolls
    const t = setTimeout(() => el.classList.add('in'), 900);
    return () => { obs.disconnect(); clearTimeout(t); };
  }, []);
  return ref;
}

export function Reveal({ as: Tag = 'h2', children, ...rest }) {
  const ref = useReveal();
  return <Tag ref={ref} class={(rest.class || '') + ' reveal'} {...rest}>{children}</Tag>;
}

export function useDoc(title, description, { noindex = false } = {}) {
  useEffect(() => {
    document.title = title;
    let m = document.querySelector('meta[name="description"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'description'); document.head.appendChild(m); }
    m.setAttribute('content', description || '');
    let r = document.querySelector('meta[name="robots"]');
    if (noindex) {
      if (!r) { r = document.createElement('meta'); r.setAttribute('name', 'robots'); document.head.appendChild(r); }
      r.setAttribute('content', 'noindex');
    } else if (r) r.setAttribute('content', 'index');
  }, [title, description, noindex]);
}

export function fmtG(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-GB') + ' g';
}
export function fmtKg(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-GB') + ' kg';
}
export function fmtBp(bp) {
  if (bp == null) return '—';
  const v = bp / 100;
  return v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' per cent';
}
export function fmtBpShort(bp) {
  if (bp == null) return '—';
  return (bp / 100).toFixed(2) + '%';
}
export function fmtMg(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-GB') + ' mg CO2e/kg';
}
export const fmtDate = (d) => (d ? String(d).slice(0, 10) : '—');
export const claimWord = (t) => t ? t.replace(/_/g, ' ') : '—';
