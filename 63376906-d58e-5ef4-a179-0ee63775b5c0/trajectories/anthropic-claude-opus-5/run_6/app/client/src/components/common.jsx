import { useEffect, useRef, useState } from 'preact/hooks';
import { Link } from '../lib/router.jsx';

// A heading resolves from a blur as the reader arrives. One component, one
// distance, one duration. Nothing a reveal governs stays hidden if the reader
// never scrolls to it.
export function Reveal({ children, as: Tag = 'div', className = '', ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setShown(true); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -5% 0px' });
    io.observe(node);
    // if the reader never scrolls here, it resolves anyway
    const timer = setTimeout(() => setShown(true), 1200);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${shown ? 'is-in' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

// Six states carry consequence, and each carries its word as well as any other
// signal. No state is signalled green and no state is carried by colour alone.
export function StateWord({ children, quiet = false, icon = null }) {
  return (
    <span className={`state-word ${quiet ? 'state-quiet' : ''}`}>
      {icon ? <Icon name={icon} /> : null}
      <span>{children}</span>
    </span>
  );
}

// Four inline vectors, each with a text label beside it, so a vector that fails
// to load costs nothing.
export function Icon({ name, title }) {
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': title ? undefined : 'true', role: title ? 'img' : undefined, focusable: 'false', style: { flex: '0 0 auto' } };
  const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'flag') {
    return (
      <svg {...common}>{title ? <title>{title}</title> : null}
        <path d="M3.5 14V2m0 .5h8l-1.6 3 1.6 3h-8" {...stroke} />
      </svg>
    );
  }
  if (name === 'lock') {
    return (
      <svg {...common}>{title ? <title>{title}</title> : null}
        <rect x="3.2" y="7" width="9.6" height="6.5" rx="1" {...stroke} />
        <path d="M5.5 7V4.8a2.5 2.5 0 0 1 5 0V7" {...stroke} />
      </svg>
    );
  }
  if (name === 'arrow') {
    return (
      <svg {...common}>{title ? <title>{title}</title> : null}
        <path d="M2.5 8h11m-4-4 4 4-4 4" {...stroke} />
      </svg>
    );
  }
  if (name === 'arrow-back') {
    return (
      <svg {...common}>{title ? <title>{title}</title> : null}
        <path d="M13.5 8h-11m4-4-4 4 4 4" {...stroke} />
      </svg>
    );
  }
  if (name === 'warning') {
    return (
      <svg {...common}>{title ? <title>{title}</title> : null}
        <path d="M8 1.8 15 14H1L8 1.8Z" {...stroke} />
        <path d="M8 6.3v3.4M8 11.6v.1" {...stroke} />
      </svg>
    );
  }
  return null;
}

// A recycled-content percentage renders with its claim type. This is a component
// rule and not a page rule: it either carries the dependency or does not render.
export function Content({ contentBp, claimType, compact = false }) {
  if (contentBp === null || contentBp === undefined || !claimType) return null;
  const words = { mass_balance: 'mass balance', controlled_blending: 'controlled blending', physically_segregated: 'physically segregated' };
  if (compact) {
    return (
      <span className="figure">
        {formatBp(contentBp)}% <span className="t-small">({words[claimType] || claimType})</span>
      </span>
    );
  }
  return (
    <span>
      <span className="figure">{formatBp(contentBp)} per cent</span>{' '}
      <span className="t-small">recycled content, claimed by {words[claimType] || claimType}</span>
    </span>
  );
}

// A carbon figure renders with its boundary, its method version and its uncertainty.
export function CarbonFigure({ carbon, comparator = true }) {
  if (!carbon || carbon.value_mg_per_kg === undefined || carbon.value_mg_per_kg === null) return null;
  if (!carbon.boundary || !carbon.method_version || carbon.uncertainty_bp === undefined || carbon.uncertainty_bp === null) {
    return (
      <p className="t-small">
        This carbon figure cannot be shown: it does not carry its boundary, its method version and its uncertainty.
      </p>
    );
  }
  return (
    <div>
      <div className="figure t-body-big">{formatInt(carbon.value_mg_per_kg)} mg CO<sub>2</sub>e / kg</div>
      <dl className="dl">
        <dt>Boundary</dt><dd>{carbon.boundary}</dd>
        <dt>Method version</dt><dd className="mono">{carbon.method_version}</dd>
        <dt>Uncertainty</dt><dd className="mono">{carbon.uncertainty_bp} bp</dd>
        {comparator && carbon.comparator ? (
          <>
            <dt>Comparator</dt>
            <dd>
              {carbon.comparator.material}, {carbon.comparator.dataset} {carbon.comparator.dataset_year}, {carbon.comparator.region}
            </dd>
          </>
        ) : null}
      </dl>
      {comparator && carbon.comparison_statement ? <p className="t-small">{carbon.comparison_statement}</p> : null}
    </div>
  );
}

// A capacity figure renders with its confidence.
export function Capacity({ kg, confidence, label }) {
  if (kg === null || kg === undefined || !confidence) return null;
  return (
    <span>
      <span className="figure">{formatInt(kg)} kg</span>
      {label ? <span className="t-small"> {label}</span> : null}{' '}
      <StateWord quiet={confidence !== 'planned'}>{confidence.replace(/_/g, ' ')}</StateWord>
    </span>
  );
}

// Nothing animates a number as it changes, because a percentage that counts up
// is briefly wrong.
export function formatInt(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-GB').format(n);
}

export function formatBp(bp) {
  if (bp === null || bp === undefined) return '—';
  const whole = Math.trunc(bp / 100);
  const frac = Math.abs(bp % 100);
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

// An empty collection says so in words rather than rendering an empty frame.
export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

// A surface waiting on data says it is loading.
export function Loading({ what = 'this surface' }) {
  return <p className="loading" role="status">Loading {what}…</p>;
}

// A refused act renders an inline banner naming what was refused and what would
// change it.
export function Refusal({ error, title = 'This act was refused' }) {
  if (!error) return null;
  const body = error.body || {};
  return (
    <div className="banner" role="alert">
      <div className="banner-title">{title}</div>
      <p className="t-small" style={{ marginBottom: body.available_g !== undefined ? '0.5rem' : 0 }}>
        {body.message || error.message}
      </p>
      {body.available_g !== undefined ? (
        <p className="mono" style={{ margin: 0 }}>
          Available: {formatInt(body.available_g)} g. Requested: {formatInt(body.requested_g)} g.
        </p>
      ) : null}
      {body.blocking && Array.isArray(body.blocking) && body.blocking.length ? (
        <ul className="t-small" style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
          {body.blocking.map((b) => (
            <li key={b.condition}>{b.condition.replace(/_/g, ' ')}: {b.detail}</li>
          ))}
        </ul>
      ) : null}
      {body.resolution ? <p className="t-small" style={{ margin: '0.5rem 0 0' }}>{body.resolution}</p> : null}
      {body.rule ? <p className="t-small" style={{ margin: '0.5rem 0 0' }}>{body.rule}</p> : null}
    </div>
  );
}

export function Ref({ children, href }) {
  if (href) return <Link href={href} className="ref">{children}</Link>;
  return <span className="ref">{children}</span>;
}

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    Promise.resolve()
      .then(fn)
      .then((data) => { if (live) setState({ loading: false, data, error: null }); })
      .catch((error) => { if (live) setState({ loading: false, data: null, error }); });
    return () => { live = false; };
  }, deps);
  return state;
}
