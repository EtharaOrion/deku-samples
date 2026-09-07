import { useEffect, useRef, useState } from 'preact/hooks';
import { Link } from '../router.jsx';

// One reveal component: one distance, one duration. Readable before it finishes,
// and never left hidden if the reader does not scroll to it.
export function Reveal({ children, as: Tag = 'div', class: cls = '', ...rest }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    const failsafe = setTimeout(() => setInView(true), 1200);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, []);
  return (
    <Tag ref={ref} class={`reveal ${inView ? 'is-in' : ''} ${cls}`} {...rest}>
      {children}
    </Tag>
  );
}

// A state always carries its word. No state is green and none is colour alone.
export function State({ word, strong = false, children }) {
  return (
    <span class={`state ${strong ? 'state--strong' : ''}`}>
      {children}
      <span>{word}</span>
    </span>
  );
}

export function Empty({ children }) {
  return <p class="empty">{children}</p>;
}

export function Loading({ what = 'this surface' }) {
  return <p class="loading" role="status" aria-live="polite">Loading {what}…</p>;
}

// A refused act renders an inline banner naming what was refused and what would
// change it.
export function Refusal({ title, children, action }) {
  return (
    <div class="banner" role="alert">
      <p class="banner__title">{title}</p>
      <div class="stack-s" style="margin-top:0.4rem">{children}</div>
      {action ? <p style="margin-top:0.6rem">{action}</p> : null}
    </div>
  );
}

// A recycled-content percentage renders with its claim type. Always.
export function Content({ bp, claimType, compact = false }) {
  if (bp === null || bp === undefined) return <span class="note">not allocated</span>;
  return (
    <span class="figure-block">
      <span class="figure-value">{bp} bp</span>{' '}
      <span class="figure-deps">
        {formatBp(bp)} recycled content · {claimType ? claimType.replace(/_/g, ' ') : 'claim type unknown'}
      </span>
    </span>
  );
}

// A carbon figure renders with its boundary, its method version and its uncertainty.
export function Carbon({ figure }) {
  if (!figure) return <span class="note">no carbon figure</span>;
  return (
    <span class="figure-block">
      <span class="figure-value">{figure.value_mg_per_kg} mg/kg</span>
      <span class="figure-deps">
        boundary {figure.boundary} · method {figure.method_version} · uncertainty {figure.uncertainty_bp} bp
      </span>
    </span>
  );
}

// A capacity figure renders with its confidence.
export function Capacity({ kg, confidence, label }) {
  return (
    <span class="figure-block">
      <span class="figure-value">{formatInt(kg)} kg/year</span>
      <span class="figure-deps">
        {label ? label + ' · ' : ''}confidence: {confidence}
        {confidence === 'planned' ? ' (planned)' : ''}
      </span>
    </span>
  );
}

// The four inline vectors the product needs, each with a text label beside it.
export function Mark({ kind, label }) {
  const paths = {
    flag: 'M4 2v16M4 3h9l-1.5 3L13 9H4',
    lock: 'M5 9V6a4 4 0 0 1 8 0v3M4 9h10v8H4z',
    arrow: 'M3 10h12M11 6l4 4-4 4',
    warning: 'M9 2 1 17h16zM9 7v5M9 14.5v.5',
  };
  return (
    <span style="display:inline-flex;align-items:center;gap:0.35rem">
      <svg width="16" height="16" viewBox="0 0 18 19" aria-hidden="true" focusable="false"
           style="flex:none">
        <path d={paths[kind] || paths.flag} fill="none" stroke="currentColor"
              stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
      <span>{label}</span>
    </span>
  );
}

export function formatInt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-GB');
}

export function formatBp(bp) {
  const whole = Math.floor(Number(bp) / 100);
  const frac = Number(bp) % 100;
  return frac === 0 ? `${whole} per cent` : `${whole}.${String(frac).padStart(2, '0')} per cent`;
}

export function Figures({ rows }) {
  return (
    <dl class="stack-s">
      {rows.map((r) => (
        <div class="balance-figure" key={r.label}>
          <dt class="label" style="margin:0">{r.label}</dt>
          <dd class="balance-figure__value" style="margin:0">{r.value}</dd>
          {r.link ? <dd style="margin:0"><Link href={r.link} class="body-small">workings</Link></dd> : <dd style="margin:0" />}
        </div>
      ))}
    </dl>
  );
}
