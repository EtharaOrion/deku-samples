import { useState, useEffect, useRef } from 'preact/hooks';
import { Link } from './router.jsx';

/* ------------------------------------------------------------- numbers ---- */
// Nothing animates a number as it changes, because a percentage that counts up
// is briefly wrong. These are plain renderings.

export const grams = (g) =>
  g === null || g === undefined ? '—' : `${Number(g).toLocaleString('en-GB')} g`;

export const kg = (v) =>
  v === null || v === undefined ? '—' : `${Number(v).toLocaleString('en-GB')} kg`;

export const bp = (v) =>
  v === null || v === undefined ? '—' : `${Number(v).toLocaleString('en-GB')} bp`;

/** A percentage is rendered from basis points without rounding up. */
export const percent = (v) => {
  if (v === null || v === undefined) return '—';
  const whole = Math.floor(v / 100);
  const frac = String(Math.abs(v % 100)).padStart(2, '0');
  return `${whole}.${frac}%`;
};

export const words = (s) => String(s || '').replace(/_/g, ' ');

/* -------------------------------------------------------------- reveal ---- */

/**
 * One component, one distance, one duration. A heading resolves from a blur and an
 * opacity as the reader arrives. Nothing it governs stays hidden if the reader never
 * scrolls to it: anything still unseen after the observer runs is shown regardless.
 */
export function Reveal({ children, as: Tag = 'div', class: cls = '', ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') { setShown(true); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -10% 0px' });
    io.observe(node);
    // A reader who never scrolls still reads everything.
    const failsafe = setTimeout(() => setShown(true), 2000);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  }, []);
  return (
    <Tag ref={ref} class={`reveal ${cls}`} data-shown={shown ? 'true' : 'false'} {...rest}>
      {children}
    </Tag>
  );
}

/* --------------------------------------------------- states, in words ---- */

/**
 * Six states carry consequence, and each carries its word as well as any other
 * signal. No state is signalled green and none is carried by colour alone.
 */
export function State({ word, consequence = false, quiet = false }) {
  return (
    <span class={`state${consequence ? ' state-consequence' : ''}${quiet ? ' state-quiet' : ''}`}>
      {word}
    </span>
  );
}

export function Flags({ flags = [], claimable, claimableReason, missingKind }) {
  const out = [];
  if (claimable === false) {
    out.push(
      <State key="nc" word="Not claimable" consequence />
    );
  }
  for (const f of flags) {
    if (f === 'non_claimable') continue;
    out.push(<State key={f} word={words(f).replace(/^\w/, (m) => m.toUpperCase())} consequence />);
  }
  if (!out.length) return null;
  return <span class="row" style="gap:0.4rem">{out}</span>;
}

/* ----------------------------------------- the three figures rules ---- */

/**
 * A recycled-content percentage renders with its claim type. This is a component
 * rule and not a page rule: it either carries the dependency or does not render.
 */
export function ContentFigure({ content_bp, claim_type, compact = false }) {
  if (content_bp === null || content_bp === undefined || !claim_type) return null;
  if (compact) {
    return (
      <span class="nowrap">
        <span class="mono">{percent(content_bp)}</span>{' '}
        <span class="figure-deps">{words(claim_type)}</span>
      </span>
    );
  }
  return (
    <span class="figure-block">
      <span class="figure-value">{percent(content_bp)} <span class="t-small">({bp(content_bp)})</span></span>
      <span class="figure-deps">Claim type: {words(claim_type)}</span>
    </span>
  );
}

/** A carbon figure renders with its boundary, its method version and its uncertainty. */
export function CarbonFigure({ carbon, comparatorName }) {
  if (!carbon) return null;
  const { value_mg_per_kg, boundary, method_version, uncertainty_bp, comparator } = carbon;
  if (value_mg_per_kg === undefined || !boundary || !method_version || uncertainty_bp === undefined) {
    return (
      <span class="figure-deps">
        This carbon figure is not returned because a component is missing.
      </span>
    );
  }
  const cmp = comparator || comparatorName;
  return (
    <span class="figure-block">
      <span class="figure-value">{Number(value_mg_per_kg).toLocaleString('en-GB')} mg CO2e/kg</span>
      <span class="figure-deps">
        Boundary {boundary} · Method {method_version} · Uncertainty {bp(uncertainty_bp)}
      </span>
      {cmp && cmp.material ? (
        <span class="figure-deps">
          Lower than {cmp.material}, {cmp.dataset} {cmp.dataset_year}, {cmp.region}
        </span>
      ) : null}
    </span>
  );
}

/** A capacity figure renders with its confidence. */
export function CapacityFigure({ value_kg, confidence, basis }) {
  if (value_kg === null || value_kg === undefined || !confidence) return null;
  return (
    <span class="figure-block">
      <span class="figure-value">{kg(value_kg)}</span>
      <span class="figure-deps">
        Confidence: {words(confidence)}{basis ? ` · Basis: ${basis}` : ''}
      </span>
    </span>
  );
}

/* ----------------------------------------------- empty, loading, refused ---- */

export function Loading({ what = 'this surface' }) {
  return <p class="loading" role="status">Loading {what}.</p>;
}

/** An empty collection says so in words rather than rendering an empty frame. */
export function Empty({ children }) {
  return <p class="empty">{children}</p>;
}

/** A refused act renders an inline banner naming what was refused and what would change it. */
export function Refusal({ title, children, actions }) {
  return (
    <div class="banner" role="alert">
      <p class="banner-title">{title || 'This act was refused'}</p>
      {children}
      {actions}
    </div>
  );
}

export function ErrorBanner({ error }) {
  if (!error) return null;
  const b = error.body || {};
  const parts = [];
  if (b.available_g !== undefined && b.requested_g !== undefined) {
    parts.push(
      <p key="m" class="mono">
        This allocation is refused. Available: {b.available_g} g. Requested: {b.requested_g} g.
      </p>
    );
  }
  if (b.rule) parts.push(<p key="r">{b.rule}</p>);
  if (!parts.length) parts.push(<p key="e">{b.message || error.message}</p>);
  return (
    <Refusal title={words(b.error || 'refused')}>
      {parts}
      {b.blocking_reference ? <p class="mono">Blocking record: {b.blocking_reference}</p> : null}
    </Refusal>
  );
}

/* ------------------------------------------------------- inline vectors ---- */
// Four marks, each drawn inline with a text label beside it, so a vector that
// fails to load costs nothing.

export function Icon({ name, title }) {
  const common = { class: 'icon', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false' };
  const shapes = {
    flag: <path d="M3 1v14M3 2h9l-2 3 2 3H3" fill="none" stroke="currentColor" stroke-width="1.5" />,
    lock: (
      <g fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="3" y="7" width="10" height="7" rx="1" />
        <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
      </g>
    ),
    arrow: <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" />,
    warning: (
      <g fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M8 1.5L15 14H1z" />
        <path d="M8 6v4M8 11.6v.1" />
      </g>
    )
  };
  return (
    <span class="row" style="gap:0.35rem;display:inline-flex">
      <svg {...common}>{shapes[name]}</svg>
      <span>{title}</span>
    </span>
  );
}

/* -------------------------------------------------------------- tables ---- */

export function TableScroll({ caption, children }) {
  return (
    <div class="table-scroll" tabindex="0" role="region" aria-label={caption}>
      <table>
        {caption ? <caption>{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function Derivation({ of }) {
  if (!of) return null;
  const entries = typeof of === 'string' ? [['', of]] : Object.entries(of);
  return (
    <details class="t-small" style="margin-top:0.75rem">
      <summary style="cursor:pointer">Where these figures came from</summary>
      <dl class="definition" style="margin-top:0.75rem">
        {entries.map(([k, v]) => (
          <>
            <dt key={`${k}t`}>{k ? words(k) : 'Derivation'}</dt>
            <dd key={`${k}d`} class="t-small">{String(v)}</dd>
          </>
        ))}
      </dl>
    </details>
  );
}
