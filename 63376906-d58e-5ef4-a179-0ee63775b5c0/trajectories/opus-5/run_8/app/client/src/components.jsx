import { useEffect, useRef, useState } from 'preact/hooks';
import { basisPoints, grams, kilograms, mgPerKg, words } from './api.js';

// The reveal: one component, one distance, one duration. A heading resolves
// from a blur as the reader arrives, and it is readable before the resolve
// finishes. Nothing stays hidden if the reader never scrolls to it.
export function Reveal({ children, as: Tag = 'div', ...rest }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return undefined;
    if (typeof IntersectionObserver !== 'function') { setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return (
    <Tag ref={ref} class={seen ? `reveal ${rest.class || ''}` : rest.class || ''} {...rest}>
      {children}
    </Tag>
  );
}

export const Loading = ({ what = 'this surface' }) => (
  <p class="loading" role="status">Loading {what}…</p>
);

// An empty collection says so in words rather than rendering an empty frame.
export const Empty = ({ children }) => <p class="empty">{children}</p>;

// A refused act renders an inline banner naming what was refused and what
// would change it.
export function Refusal({ error, title = 'This act was refused' }) {
  if (!error) return null;
  const body = error.body || {};
  return (
    <div class="banner" role="alert">
      <p class="eyebrow eyebrow-ink">{title}</p>
      <p class="body-small" style="margin-bottom:0.4rem">{body.message || error.message}</p>
      {body.available_g !== undefined && (
        <p class="mono" style="margin:0">
          Available: {body.available_g.toLocaleString('en-GB')} g. Requested: {body.requested_g.toLocaleString('en-GB')} g.
        </p>
      )}
      {body.rule && <p class="body-small" style="margin:0"><em>{body.rule}</em></p>}
      {Array.isArray(body.blocking) && body.blocking.length > 0 && (
        <ul class="body-small" style="margin:0.5rem 0 0">
          {body.blocking.map((b) => (
            <li key={b.condition || b}>
              {typeof b === 'string' ? words(b) : `${words(b.condition)}${b.detail ? `: ${b.detail}` : ''}`}
            </li>
          ))}
        </ul>
      )}
      {Array.isArray(body.reasons) && (
        <ul class="body-small" style="margin:0.5rem 0 0">
          {body.reasons.map((r) => <li key={r.reason}>{words(r.reason)}</li>)}
        </ul>
      )}
      {Array.isArray(body.owed) && body.owed.length > 0 && (
        <p class="body-small" style="margin:0.5rem 0 0">Owed notice: {body.owed.join(', ')}</p>
      )}
    </div>
  );
}

// No state is carried by colour alone: each of the six carries its word.
export const StateWord = ({ children, strong = false }) => (
  <span class={strong ? 'state-word state-word-strong' : 'state-word'}>{children}</span>
);

// The three figures that never render alone. This is a component rule: each
// either carries its dependencies or does not render the figure.
export function ContentFigure({ content_bp, claim_type, compact = false }) {
  if (typeof content_bp !== 'number' || !claim_type) {
    return <span class="body-small">Recycled content is not available without its claim type.</span>;
  }
  return (
    <span>
      <span class="figure">{basisPoints(content_bp)}</span>{' '}
      <span class="label">{compact ? words(claim_type) : `claim type ${words(claim_type)}`}</span>
    </span>
  );
}

export function CarbonFigure({ carbon, compact = false }) {
  const c = carbon || {};
  const complete = typeof c.value_mg_per_kg === 'number' && c.boundary
    && (c.method_version !== undefined && c.method_version !== null) && typeof c.uncertainty_bp === 'number';
  if (!complete) {
    return (
      <span class="body-small">
        A carbon figure is not shown without its boundary, its method version and its uncertainty.
      </span>
    );
  }
  const label = c.method_version_label || `version ${c.method_version}`;
  return (
    <span>
      <span class="figure">{mgPerKg(c.value_mg_per_kg)}</span>{' '}
      <span class="label">
        {c.boundary}, {label}, uncertainty {basisPoints(c.uncertainty_bp)}
      </span>
      {!compact && c.comparator_relation && (
        <span class="body-small" style="display:block">{c.comparator_relation}</span>
      )}
    </span>
  );
}

export function CapacityFigure({ nameplate_kg, confidence, basis }) {
  if (typeof nameplate_kg !== 'number' || !confidence) {
    return <span class="body-small">A capacity figure is not shown without its confidence.</span>;
  }
  return (
    <span>
      <span class="figure">{kilograms(nameplate_kg)} per year</span>{' '}
      <span class="label">confidence: {words(confidence)}</span>
      {basis && <span class="body-small" style="display:block">Basis: {basis}</span>}
    </span>
  );
}

export const Grams = ({ g }) => <span class="figure">{grams(g)}</span>;

// The four inline vectors the product needs, each with a text label beside it,
// so a vector that fails to load costs nothing.
const svgProps = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'aria-hidden': 'true', focusable: 'false' };

export const Icon = ({ name, label }) => {
  const shapes = {
    flag: <><path d="M4 14V2" /><path d="M4 3h8l-1.5 2.5L12 8H4z" /></>,
    lock: <><rect x="3" y="7" width="10" height="7" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 015 0v2" /></>,
    arrow: <><path d="M2 8h12" /><path d="M10 4l4 4-4 4" /></>,
    warning: <><path d="M8 2l6 11H2z" /><path d="M8 6.5v3" /><path d="M8 11.2v.3" /></>,
  };
  return (
    <span style="display:inline-flex;align-items:center;gap:0.35rem;white-space:nowrap">
      <svg {...svgProps}>{shapes[name] || shapes.arrow}</svg>
      <span class="label">{label}</span>
    </span>
  );
};

export function Table({ columns, rows, empty, caption }) {
  if (!rows || rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div class="table-scroll">
      <table>
        {caption && <caption class="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} class={col.numeric ? 'num' : undefined} scope="col">{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.key || row.reference || i}>
              {columns.map((col) => (
                <td key={col.key} class={col.numeric ? 'num' : undefined}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const DefRow = ({ term, children }) => (
  <div class="def-row">
    <dt>{term}</dt>
    <dd>{children}</dd>
  </div>
);
