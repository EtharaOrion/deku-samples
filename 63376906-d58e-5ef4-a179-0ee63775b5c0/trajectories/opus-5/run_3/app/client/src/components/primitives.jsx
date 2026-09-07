import { useEffect, useRef, useState } from 'preact/hooks';

/** A heading resolves from a blur as the reader arrives rather than fading in.
 *  One component, one distance, one duration. No element a reveal governs stays
 *  hidden if the reader never scrolls to it: anything already on screen, and
 *  anything the observer cannot reach, resolves immediately. */
export function Reveal({ children, as: Tag = 'div', className = '', ...rest }) {
  const ref = useRef(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setRevealed(true); return; }
    // Anything already in view resolves on the first frame.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { setRevealed(true); io.disconnect(); }
      }
    }, { rootMargin: '0px 0px -5% 0px', threshold: 0.01 });
    io.observe(el);
    // A safety net: if the reader never scrolls, the text still resolves.
    const t = setTimeout(() => setRevealed(true), 1200);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);

  return (
    <Tag ref={ref} class={`reveal ${className}`} data-revealed={String(revealed)} {...rest}>
      {children}
    </Tag>
  );
}

/** No state anywhere is signalled green, and no state is carried by colour
 *  alone. Each of the six states that carry consequence renders its word. */
export function StateWord({ word, detail, tone = 'plain' }) {
  return (
    <span class={`state-word state-${tone}`}>
      <span class="state-mark" aria-hidden="true" />
      <span class="state-text">{word}</span>
      {detail ? <span class="state-detail">{detail}</span> : null}
    </span>
  );
}

/** A recycled-content percentage renders with its claim type. This is a
 *  component rule and not a page rule: the component either carries the
 *  dependency or does not render the figure. */
export function ContentFigure({ contentBp, claimType, compact = false, label = 'Recycled content' }) {
  if (contentBp === null || contentBp === undefined || !claimType) {
    return <span class="t-muted t-small">Not yet allocated</span>;
  }
  return (
    <span class={compact ? 'figure-compact' : 'figure-block'}>
      {!compact && <span class="t-label">{label}</span>}
      <span class="t-figure figure-value">{formatBp(contentBp)}%</span>
      {/* The claim type is carried as a word, never as a colour and never as an
          icon, and it is returned at the same weight as the percentage. */}
      <span class="figure-claim-type">{claimTypeWords(claimType)}</span>
      {!compact && <span class="t-label t-mono">{contentBp} basis points</span>}
    </span>
  );
}

/** A carbon figure renders with its boundary, its method version and its
 *  uncertainty. Without all three it does not render at all. */
export function CarbonFigure({ carbon, compact = false }) {
  if (!carbon || carbon.value_mg_per_kg === null || carbon.value_mg_per_kg === undefined
    || !carbon.boundary || !carbon.method_version
    || carbon.uncertainty_bp === null || carbon.uncertainty_bp === undefined) {
    return (
      <span class="t-muted t-small">
        No carbon figure with its boundary, method version and uncertainty.
      </span>
    );
  }
  return (
    <span class={compact ? 'figure-compact' : 'figure-block'}>
      {!compact && <span class="t-label">Product carbon footprint</span>}
      <span class="t-figure figure-value">{carbon.value_mg_per_kg.toLocaleString('en-GB')} mg CO2e/kg</span>
      <span class="figure-deps">
        <span>{carbon.boundary}</span>
        <span aria-hidden="true"> · </span>
        <span class="t-mono">{carbon.method_version}</span>
        <span aria-hidden="true"> · </span>
        <span>uncertainty {carbon.uncertainty_bp} bp</span>
      </span>
      {carbon.default_led && (
        <StateWord word="default-led" detail={`primary data share ${carbon.primary_share_bp} bp, below the ${carbon.primary_threshold_bp} bp threshold`} />
      )}
      {carbon.comparison && !compact && (
        <span class="t-small t-muted figure-comparison">{carbon.comparison.statement}</span>
      )}
    </span>
  );
}

/** A capacity figure renders with its confidence. */
export function CapacityFigure({ kg, confidence, label, compact = false }) {
  if (kg === null || kg === undefined || !confidence) {
    return <span class="t-muted t-small">No capacity figure with its confidence.</span>;
  }
  return (
    <span class={compact ? 'figure-compact' : 'figure-block'}>
      {label && !compact && <span class="t-label">{label}</span>}
      <span class="t-figure figure-value">{kg.toLocaleString('en-GB')} kg/year</span>
      <span class="figure-deps">{confidenceWords(confidence)}</span>
    </span>
  );
}

/** The two energy figures are returned together and rendered together, never
 *  one alone. */
export function EnergyPanel({ energy }) {
  if (!energy || energy.energy_location_mg_per_kg === undefined
    || energy.energy_market_mg_per_kg === undefined) {
    return <p class="t-muted t-small">The two energy figures are shown together or not at all.</p>;
  }
  return (
    <div class="energy-panel">
      <div class="energy-pair">
        <div class="energy-figure">
          <span class="t-label">Location based</span>
          <span class="t-figure figure-value">{energy.energy_location_mg_per_kg.toLocaleString('en-GB')}</span>
          <span class="t-label">mg CO2e per kg</span>
        </div>
        <div class="energy-figure">
          <span class="t-label">Market based</span>
          <span class="t-figure figure-value">{energy.energy_market_mg_per_kg.toLocaleString('en-GB')}</span>
          <span class="t-label">mg CO2e per kg</span>
        </div>
      </div>
      <dl class="kv">
        <div><dt>Metered</dt><dd class="t-mono">{energy.metered_kwh?.toLocaleString('en-GB')} kWh</dd></div>
        <div><dt>Retired</dt><dd class="t-mono">{energy.retired_kwh?.toLocaleString('en-GB')} kWh</dd></div>
        <div><dt>Unmatched</dt><dd class="t-mono">{energy.unmatched_kwh?.toLocaleString('en-GB')} kWh</dd></div>
      </dl>
      {energy.instruments?.length ? (
        <div class="table-scroll">
          <table>
            <caption class="visually-hidden">Energy instruments retired against this period</caption>
            <thead>
              <tr><th scope="col">Instrument</th><th scope="col" class="num">Quantity</th>
                <th scope="col">Vintage</th><th scope="col">Region</th><th scope="col">State</th></tr>
            </thead>
            <tbody>
              {energy.instruments.map((i) => (
                <tr key={i.reference}>
                  <td class="t-mono">{i.reference}</td>
                  <td class="num">{i.quantity_kwh.toLocaleString('en-GB')} kWh</td>
                  <td>{i.vintage}</td>
                  <td>{i.region}</td>
                  <td>{i.state}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p class="t-muted t-small">No instrument has been retired against this period.</p>}
    </div>
  );
}

/** A refused act renders an inline banner naming what was refused and what
 *  would change it. It is never a toast and never disappears on its own. */
export function Refusal({ refusal, onDismiss }) {
  if (!refusal) return null;
  return (
    <div class="refusal" role="alert">
      <p class="t-label refusal-head">Refused: {refusal.error?.replace(/_/g, ' ') || 'the act did not happen'}</p>
      <p class="refusal-detail">{refusal.detail}</p>
      {refusal.available_g !== undefined && refusal.requested_g !== undefined && (
        <p class="t-mono refusal-figures">
          Available: {refusal.available_g.toLocaleString('en-GB')} g.
          {' '}Requested: {refusal.requested_g.toLocaleString('en-GB')} g.
        </p>
      )}
      {refusal.blockers?.length ? (
        <ul class="refusal-list">
          {refusal.blockers.map((b, i) => (
            <li key={i}>{b.condition} — <span class="t-mono">{b.blocking_reference}</span></li>
          ))}
        </ul>
      ) : null}
      {refusal.unmet?.length ? (
        <ul class="refusal-list">
          {refusal.unmet.map((u, i) => <li key={i}>{u.condition}: {u.detail}</li>)}
        </ul>
      ) : null}
      {refusal.owed_notice?.length ? (
        <ul class="refusal-list">{refusal.owed_notice.map((o) => <li key={o} class="t-mono">{o}</li>)}</ul>
      ) : null}
      {refusal.refusals?.length ? (
        <ul class="refusal-list">{refusal.refusals.map((r, i) => <li key={i}>{r}</li>)}</ul>
      ) : null}
      {onDismiss && (
        <button type="button" class="refusal-close" onClick={onDismiss}>
          Close this notice
        </button>
      )}
    </div>
  );
}

/** A surface waiting on data says it is loading. */
export function Loading({ what = 'this surface' }) {
  return <p class="t-muted loading-note" role="status">Loading {what}.</p>;
}

/** An empty collection says so in words rather than rendering an empty frame. */
export function Empty({ children }) {
  return <p class="t-muted empty-note">{children}</p>;
}

/* --------------------------------------------------------------- helpers */

export function formatBp(bp) {
  // A percentage is rendered from basis points and never animated, because a
  // percentage that counts up is briefly wrong.
  const whole = Math.floor(bp / 100);
  const frac = String(Math.abs(bp % 100)).padStart(2, '0');
  return `${whole}.${frac}`;
}

export function formatG(g) {
  if (g === null || g === undefined) return '—';
  return g.toLocaleString('en-GB');
}

export function claimTypeWords(t) {
  return {
    mass_balance: 'mass balance',
    controlled_blending: 'controlled blending',
    physically_segregated: 'physically segregated'
  }[t] || t;
}

export function confidenceWords(c) {
  return {
    commissioned: 'commissioned',
    under_construction: 'under construction',
    consented: 'consented',
    planned: 'planned'
  }[c] || c;
}

/** The four inline vectors the product needs, each drawn rather than fetched
 *  and each with a text label beside it, so a vector that fails to load costs
 *  nothing. */
export function Mark({ kind, label }) {
  const paths = {
    flag: 'M4 2v16M4 3h9l-1.6 3L13 9H4',
    lock: 'M5 9V6.5a4 4 0 018 0V9M3.5 9h11v8h-11z',
    traversal: 'M2 10h13M11 6l4 4-4 4',
    warning: 'M9 2l7.5 14h-15zM9 7v4M9 13.2v.1'
  };
  return (
    <span class="mark-with-label">
      <svg class="mark" viewBox="0 0 18 18" width="14" height="14" aria-hidden="true" focusable="false">
        <path d={paths[kind] || paths.flag} fill="none" stroke="currentColor" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>{label}</span>
    </span>
  );
}
