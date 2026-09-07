import { useEffect, useRef, useState } from 'preact/hooks';
import {
  grams, basisPoints, percentFromBp, mgPerKg, kwh, kilograms, words, titleCase, date,
} from '../lib/format.js';

/* The reveal: one component, one distance, one duration. A heading resolves
   from a blur as the reader arrives, and the text is readable before the
   animation finishes. No element it governs stays hidden if the reader never
   scrolls to it. */
export function Reveal({ children, as: Tag = 'div', class: cls = '', ...rest }) {
  const ref = useRef(null);
  const [resolved, setResolved] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) { setResolved(true); return; }
    // Nothing stays hidden: a timer resolves it whether or not it is scrolled to.
    const timer = setTimeout(() => setResolved(true), 1200);
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setResolved(true); io.disconnect(); }
    }, { rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, []);
  return (
    <Tag ref={ref} class={`reveal ${resolved ? 'resolved' : ''} ${cls}`} {...rest}>
      {children}
    </Tag>
  );
}

/* An empty collection says so in words rather than rendering an empty frame. */
export function Empty({ children }) {
  return <p class="note">{children}</p>;
}

/* A surface waiting on data says it is loading. */
export function Loading({ what = 'this surface' }) {
  return <p class="note" role="status" aria-live="polite">Loading {what}…</p>;
}

/* A refused act renders an inline banner naming what was refused and what would
   change it. */
export function Refusal({ error, title = 'This act was refused' }) {
  if (!error) return null;
  const b = error.body || {};
  return (
    <div class="banner" role="alert">
      <p class="label" style="margin:0 0 .35rem">{title}</p>
      <p style="margin:0 0 .5rem"><strong>{error.message}</strong></p>
      {b.available_g !== undefined && b.requested_g !== undefined && (
        <p class="figure" style="margin:0 0 .5rem">
          Available: {grams(b.available_g)}. Requested: {grams(b.requested_g)}.
        </p>
      )}
      {b.rule && <p class="note mono" style="margin:0">Rule: {b.rule}</p>}
      {b.blocking_reference && (
        <p class="note" style="margin:.35rem 0 0">Resolved by: <span class="mono">{b.blocking_reference}</span></p>
      )}
      {Array.isArray(b.blocking) && b.blocking.length > 0 && (
        <ul style="margin:.5rem 0 0">
          {b.blocking.map((x) => (
            <li key={x.condition}>{words(x.condition)} — {x.detail}</li>
          ))}
        </ul>
      )}
      {Array.isArray(b.reasons) && (
        <ul style="margin:.5rem 0 0">{b.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
    </div>
  );
}

/* A state carries its word as well as any other signal. Nothing is green and
   nothing is carried by colour alone. */
export function Word({ children, quiet = false }) {
  return <span class={`word ${quiet ? 'word-quiet' : ''}`}>{children}</span>;
}

/* The three figures that never render alone. Each either carries its
   dependencies or does not render the figure. This is a component rule. */

export function RecycledContent({ content_bp, claim_type, compact = false }) {
  if (content_bp === null || content_bp === undefined || !claim_type) return null;
  if (compact) {
    // A compact variant carries the claim type as a word, never as a colour and
    // never as an icon.
    return (
      <span class="figure">
        {basisPoints(content_bp)} <span class="label" style="text-transform:none">{words(claim_type)}</span>
      </span>
    );
  }
  return (
    <span>
      <span class="figure">{basisPoints(content_bp)} ({percentFromBp(content_bp)})</span>{' '}
      <Word>{words(claim_type)}</Word>
    </span>
  );
}

export function CarbonFigure({ carbon, compact = false }) {
  if (!carbon) return null;
  const { value_mg_per_kg, boundary, method_version, uncertainty_bp } = carbon;
  // A response carrying a value without its boundary, method version and
  // uncertainty does not exist, and neither does a rendering of one.
  if (value_mg_per_kg === undefined || !boundary || !method_version ||
      uncertainty_bp === undefined || uncertainty_bp === null) {
    return <p class="note">This carbon figure is incomplete and is not rendered.</p>;
  }
  const comparator = carbon.comparator;
  const relation = comparator?.comparator_mg_per_kg
    ? (value_mg_per_kg < comparator.comparator_mg_per_kg ? 'Lower than' : 'Higher than')
    : null;
  return (
    <div>
      <p class="figure" style="margin:0"><strong>{mgPerKg(value_mg_per_kg)}</strong></p>
      <p class="note" style="margin:.2rem 0 0">
        Boundary <span class="mono">{boundary}</span>,
        method <span class="mono">{method_version}</span>,
        uncertainty <span class="mono">{basisPoints(uncertainty_bp)}</span>
      </p>
      {!compact && relation && comparator && (
        <p class="note" style="margin:.2rem 0 0">
          {relation} {comparator.material} from {comparator.dataset} {comparator.dataset_year}, {comparator.region}.
        </p>
      )}
      {!compact && carbon.default_led !== undefined && (
        <p class="note" style="margin:.2rem 0 0">
          Primary data share {basisPoints(carbon.primary_share_bp)}.{' '}
          {carbon.default_led
            ? 'This figure is default-led: it is not metered.'
            : 'Above the primary-data threshold.'}
        </p>
      )}
    </div>
  );
}

export function CapacityFigure({ nameplate_kg, confidence, basis, compact = false }) {
  if (nameplate_kg === null || nameplate_kg === undefined || !confidence) return null;
  return (
    <span>
      <span class="figure">{kilograms(nameplate_kg)}</span>{' '}
      <Word quiet={confidence !== 'planned'}>{words(confidence)}</Word>
      {!compact && basis && <span class="note"> — {basis}</span>}
    </span>
  );
}

/* The energy lines are returned together and rendered together, never one
   alone. */
export function EnergyPanel({ carbon }) {
  if (!carbon) return null;
  return (
    <div class="sheet-flat">
      <p class="label" style="margin:0 0 .5rem">Energy</p>
      <div class="two-up">
        <div>
          <p class="label" style="margin:0">Location-based</p>
          <p class="figure" style="margin:0">{mgPerKg(carbon.energy_location_mg_per_kg)}</p>
        </div>
        <div>
          <p class="label" style="margin:0">Market-based</p>
          <p class="figure" style="margin:0">{mgPerKg(carbon.energy_market_mg_per_kg)}</p>
        </div>
      </div>
      <hr class="hairline" />
      <table>
        <caption class="visually-hidden">Metered, retired and unmatched consumption</caption>
        <tbody>
          <tr><th scope="row">Metered</th><td class="num figure">{kwh(carbon.metered_kwh)}</td></tr>
          <tr><th scope="row">Retired</th><td class="num figure">{kwh(carbon.retired_kwh)}</td></tr>
          <tr><th scope="row">Unmatched</th><td class="num figure">{kwh(carbon.unmatched_kwh)}</td></tr>
        </tbody>
      </table>
      {carbon.retired_instruments?.length > 0 ? (
        <>
          <p class="label" style="margin:1rem 0 .35rem">Retired instruments</p>
          <ul style="margin:0">
            {carbon.retired_instruments.map((i) => (
              <li key={i.reference} class="mono">
                {i.reference} — {kwh(i.quantity_kwh)}, vintage {i.vintage}, {i.region}, {i.state}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty>No instrument has been retired against this period.</Empty>
      )}
    </div>
  );
}

/* The four inline vectors the product needs, each with a text label beside it,
   so a vector that fails to load costs nothing. */
export function Mark({ kind, label }) {
  const paths = {
    flag: 'M4 2v16M4 3h10l-2 3 2 3H4',
    lock: 'M6 9V6a4 4 0 018 0v3M4 9h12v9H4z',
    arrow: 'M3 10h13M11 5l5 5-5 5',
    warning: 'M10 3l8 14H2zM10 8v4M10 14.5v.5',
  };
  return (
    <span style="display:inline-flex;align-items:center;gap:.35rem">
      <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true" focusable="false"
        style="flex:none">
        <path d={paths[kind] || paths.flag} fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>{label}</span>
    </span>
  );
}

export function Figure({ children }) {
  return <span class="figure">{children}</span>;
}
