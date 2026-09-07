import { useEffect, useRef, useState } from 'preact/hooks';

/* ---------------------------------------------------------------------------
   Formatting. Nothing here computes a figure; it only renders one.
   A number never animates as it changes, because a percentage that counts up
   is briefly wrong.
   --------------------------------------------------------------------------- */

export function grams(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-GB') + ' g';
}
export function kilograms(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('en-GB') + ' kg';
}
export function bp(n) {
  if (n === null || n === undefined) return '—';
  const whole = Math.trunc(n / 100);
  const frac = String(Math.abs(n % 100)).padStart(2, '0');
  return `${whole}.${frac}%`;
}
export function words(s) {
  return String(s || '').replace(/_/g, ' ');
}

/* --- The reveal: one component, one distance, one duration ---------------- */

export function Reveal({ children, as: As = 'div', className = '', ...rest }) {
  const el = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (!('IntersectionObserver' in window)) { setSeen(true); return; }
    const io = new IntersectionObserver(
      (entries) => {
        // Nothing a reveal governs stays hidden if the reader never scrolls.
        if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(node);
    const fallback = setTimeout(() => { setSeen(true); io.disconnect(); }, 1500);
    return () => { io.disconnect(); clearTimeout(fallback); };
  }, []);
  return (
    <As ref={el} class={`reveal ${seen ? 'is-in' : ''} ${className}`} {...rest}>
      {children}
    </As>
  );
}

/* --- State words. No state is green and none is carried by colour alone. -- */

export function StateWord({ word, heavy = false, quiet = false, icon = null }) {
  return (
    <span class={`state ${heavy ? 'state-heavy' : ''} ${quiet ? 'state-quiet' : ''}`}>
      {icon}
      {word}
    </span>
  );
}

/* --- The four inline vectors the product needs, each with a text label ---- */

export function Icon({ name, label }) {
  const paths = {
    flag: <path d="M4 14V2M4 2h8l-2 3 2 3H4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />,
    lock: <g fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3.25" y="7" width="9.5" height="7" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></g>,
    arrow: <path d="M2 8h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />,
    warning: <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 2.5 14.5 13.5h-13z" stroke-linejoin="round" /><path d="M8 6.5v3.2M8 11.8v.2" /></g>,
  };
  return (
    <>
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">{paths[name]}</svg>
      <span class="visually-hidden">{label}</span>
    </>
  );
}

/* --- The three figures that never render alone.
   This is a component rule, not a page rule: each either carries the
   dependencies or does not render the figure. --------------------------- */

export function ContentFigure({ content_bp, claim_type, compact = false }) {
  if (content_bp === null || content_bp === undefined || !claim_type) return <span class="mono">—</span>;
  return (
    <span class="figure">
      <span class="mono">{bp(content_bp)}</span>{' '}
      <span class="t-label" style="text-transform:none;letter-spacing:0.02em">
        {compact ? words(claim_type) : `recycled content, ${words(claim_type)}`}
      </span>
    </span>
  );
}

export function CarbonFigure({ carbon, compact = false }) {
  if (!carbon) return <span class="mono">—</span>;
  const v = carbon.value_mg_per_kg;
  const boundary = carbon.boundary;
  const mv = carbon.method_version;
  const unc = carbon.uncertainty_bp;
  // A response carrying a value without its boundary, method version and
  // uncertainty does not exist. Neither does a rendering of one.
  if (v == null || !boundary || !mv || unc == null) {
    return <span class="t-small">A carbon figure without its boundary, method version and uncertainty is not shown.</span>;
  }
  return (
    <span class="figure">
      <span class="mono">{Number(v).toLocaleString('en-GB')}</span>{' '}
      <span class="t-label" style="text-transform:none;letter-spacing:0.02em">
        mg CO₂e/kg · {boundary} · {mv} · ±{bp(unc)}
      </span>
      {!compact && carbon.comparator ? (
        <span class="t-small" style="display:block;color:var(--muted)">
          {Number(v) < Number(carbon.comparator.value_mg_per_kg || Infinity) ? 'Lower' : 'Higher'} than{' '}
          {carbon.comparator.material}, {carbon.comparator.dataset} {carbon.comparator.dataset_year}, {carbon.comparator.region}.
        </span>
      ) : null}
    </span>
  );
}

export function CapacityFigure({ kg, confidence, compact = false }) {
  if (kg == null || !confidence) return <span class="mono">—</span>;
  return (
    <span class="figure">
      <span class="mono">{Number(kg).toLocaleString('en-GB')}</span>{' '}
      <span class="t-label" style="text-transform:none;letter-spacing:0.02em">
        kg/year · {words(confidence)}
      </span>
      {confidence === 'planned' && !compact ? (
        <> <StateWord word="Planned" icon={<Icon name="flag" label="Flag" />} /></>
      ) : null}
    </span>
  );
}

export function EnergyPair({ location, market }) {
  // Never one alone.
  if (location == null || market == null) {
    return <p class="t-small">The energy figures are returned together or not at all.</p>;
  }
  return (
    <div class="grid grid-2">
      <div>
        <p class="t-eyebrow">Location-based</p>
        <p class="figure mono">{Number(location).toLocaleString('en-GB')} mg CO₂e/kg</p>
      </div>
      <div>
        <p class="t-eyebrow">Market-based</p>
        <p class="figure mono">{Number(market).toLocaleString('en-GB')} mg CO₂e/kg</p>
      </div>
    </div>
  );
}

/* --- Empty, loading and refused ------------------------------------------ */

export function Empty({ children }) {
  return <p class="empty">{children}</p>;
}

export function Loading({ what = 'this surface' }) {
  return <p class="loading" role="status">Loading {what}…</p>;
}

export function Refusal({ error }) {
  if (!error) return null;
  const b = error.body || {};
  return (
    <div class="banner" role="alert">
      <p class="t-eyebrow">Refused</p>
      <p><strong>{b.message || error.message || 'This act was refused.'}</strong></p>
      {b.available_g !== undefined && b.requested_g !== undefined ? (
        <p class="mono">Available: {grams(b.available_g)}. Requested: {grams(b.requested_g)}.</p>
      ) : null}
      {b.error ? <p class="t-small mono">{b.error}</p> : null}
      {b.rule ? <p class="t-small">{b.rule}</p> : null}
      {Array.isArray(b.reasons)
        ? <ul class="t-small">{b.reasons.map((r) => <li key={JSON.stringify(r)}>{words(r.reason)}: {(r.references || []).join(', ')}</li>)}</ul>
        : null}
    </div>
  );
}

/* --- Data loading -------------------------------------------------------- */

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ loading: true, data: null, error: null });
    Promise.resolve()
      .then(fn)
      .then((data) => live && setState({ loading: false, data, error: null }))
      .catch((error) => live && setState({ loading: false, data: null, error }));
    return () => { live = false; };
  }, deps);
  return state;
}

export function useTitle(title, description) {
  useEffect(() => {
    document.title = title;
    let m = document.querySelector('meta[name="description"]');
    if (!m) {
      m = document.createElement('meta');
      m.setAttribute('name', 'description');
      document.head.appendChild(m);
    }
    m.setAttribute('content', description || '');
  }, [title, description]);
}

export function useNoIndex(on) {
  useEffect(() => {
    let m = document.querySelector('meta[name="robots"]');
    if (on) {
      if (!m) {
        m = document.createElement('meta');
        m.setAttribute('name', 'robots');
        document.head.appendChild(m);
      }
      m.setAttribute('content', 'noindex, nofollow');
    } else if (m) {
      m.remove();
    }
    return () => {
      const cur = document.querySelector('meta[name="robots"]');
      if (cur && on) cur.remove();
    };
  }, [on]);
}
