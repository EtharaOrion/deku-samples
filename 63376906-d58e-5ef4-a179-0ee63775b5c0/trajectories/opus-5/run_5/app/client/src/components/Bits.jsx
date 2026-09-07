import { Link, grams, bp, bpAsPercent, mgPerKg, kg, words, dateOf } from '../lib.jsx';

/* Four inline vectors, each with a text label beside it. A vector that fails
   to load costs nothing, because the word is the signal. */

export function IconFlag({ title = 'Flag' }) {
  return (
    <svg class="icon" viewBox="0 0 16 16" role="img" aria-label={title} fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M3 14V2.5h9l-2 3 2 3H3" stroke-linejoin="round" />
    </svg>
  );
}
export function IconLock({ title = 'Closed' }) {
  return (
    <svg class="icon" viewBox="0 0 16 16" role="img" aria-label={title} fill="none" stroke="currentColor" stroke-width="1.5">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}
export function IconArrow({ title = 'Traversal direction', reverse = false }) {
  return (
    <svg class="icon" viewBox="0 0 16 16" role="img" aria-label={title} fill="none" stroke="currentColor" stroke-width="1.5" style={reverse ? 'transform:scaleX(-1)' : ''}>
      <path d="M2 8h11M9.5 4.5 13 8l-3.5 3.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
export function IconWarning({ title = 'Warning' }) {
  return (
    <svg class="icon" viewBox="0 0 16 16" role="img" aria-label={title} fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M8 2.5 14.5 13.5h-13L8 2.5Z" stroke-linejoin="round" />
      <path d="M8 6.5v3.25M8 11.75v.5" stroke-linecap="round" />
    </svg>
  );
}

/* Six states carry consequence and each carries its word. No state is green,
   and no state is carried by colour alone. */

export function Word({ children, firm = false, quiet = false, icon = null }) {
  return (
    <span class={`word ${firm ? 'word-firm' : ''} ${quiet ? 'word-quiet' : ''}`}>
      {icon}
      {children}
    </span>
  );
}

export function StateWords({ flags = [], claimable, disposition, deviationOpen, overrideUnreviewed, certificateState, capacityConfidence, periodState }) {
  const out = [];
  if (claimable === false) out.push(<Word key="nc" firm icon={<IconWarning title="Non-claimable" />}>Non-claimable</Word>);
  if ((flags || []).includes('lapsed_calibration')) out.push(<Word key="lc" firm icon={<IconWarning title="Lapsed calibration" />}>Calibration lapsed</Word>);
  if ((flags || []).includes('custody_link_missing')) out.push(<Word key="cm" firm icon={<IconWarning title="Custody link missing" />}>Custody link missing</Word>);
  if (deviationOpen) out.push(<Word key="dv" firm icon={<IconFlag title="Open deviation" />}>Deviation open</Word>);
  if (overrideUnreviewed) out.push(<Word key="ov" firm icon={<IconFlag title="Unreviewed override" />}>Override unreviewed</Word>);
  if (certificateState === 'withdrawn') out.push(<Word key="wd" firm>Withdrawn</Word>);
  if (capacityConfidence === 'planned') out.push(<Word key="pl" firm>Planned</Word>);
  if (periodState === 'closed') out.push(<Word key="cl" icon={<IconLock title="Closed period" />}>Closed</Word>);
  if (disposition) out.push(<Word key="dp" quiet={disposition === 'pending'}>{words(disposition)}</Word>);
  if (!out.length) return null;
  return <span style="display:inline-flex;gap:0.375rem;flex-wrap:wrap">{out}</span>;
}

/* -------- The three figures that never render alone.
   Each is a component and each either carries the dependencies or does not
   render the figure. -------------------------------------------------- */

export function ContentFigure({ content_bp, claim_type, compact = false, category_split = null }) {
  if (content_bp === null || content_bp === undefined || !claim_type) {
    return <span class="note">A recycled-content percentage renders with its claim type. One of the two is missing, so neither is shown.</span>;
  }
  if (compact) {
    return (
      <span>
        <span class="mono">{bpAsPercent(content_bp)}</span>{' '}
        <span class="t-label-small muted">{words(claim_type)}</span>
      </span>
    );
  }
  // The claim type is stated before the percentage, so a reader moving through
  // this component by ear reaches the type first.
  return (
    <div>
      <div class="t-label-small muted">Claim type</div>
      <div class="t-label" style="margin-bottom:0.375rem">{words(claim_type)}</div>
      <div class="figure-value">{bpAsPercent(content_bp)}</div>
      <ul class="dep-list">
        <li>Claim type: {words(claim_type)}</li>
        <li>{bp(content_bp)}, computed from the ledger</li>
        {category_split ? (
          <li>
            {Object.entries(category_split)
              .filter(([, v]) => Number(v) > 0)
              .map(([k, v]) => `${words(k)} ${grams(v)}`)
              .join(', ') || 'no category attached'}
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function CarbonFigure({ carbon, compact = false }) {
  if (!carbon || carbon.value_mg_per_kg == null || !carbon.boundary || !carbon.method_version || carbon.uncertainty_bp == null) {
    return <span class="note">A carbon figure renders with its boundary, its method version and its uncertainty. One of the four is missing, so the figure is not shown.</span>;
  }
  const cmp = carbon.comparator || {};
  if (compact) {
    return (
      <span>
        <span class="mono">{mgPerKg(carbon.value_mg_per_kg)}</span>{' '}
        <span class="t-label-small muted">
          {carbon.boundary} · {carbon.method_version} · ±{bp(carbon.uncertainty_bp)}
        </span>
      </span>
    );
  }
  return (
    <div>
      <div class="figure-value">{mgPerKg(carbon.value_mg_per_kg)}</div>
      <ul class="dep-list">
        <li>Boundary: {carbon.boundary}</li>
        <li>Method version: {carbon.method_version}</li>
        <li>Uncertainty: {bp(carbon.uncertainty_bp)}</li>
        {cmp.material ? (
          <li>
            This figure is {carbon.value_mg_per_kg < (cmp.value_mg_per_kg ?? Infinity) ? 'lower' : 'higher'} than {cmp.material} from {cmp.dataset} ({cmp.dataset_year}), {cmp.region}.
          </li>
        ) : null}
        {carbon.default_led ? <li>Default-led: the primary data share is below the stated threshold.</li> : null}
      </ul>
    </div>
  );
}

export function CapacityFigure({ nameplate_kg, confidence, basis, compact = false }) {
  if (nameplate_kg == null || !confidence) {
    return <span class="note">A capacity figure renders with its confidence. One of the two is missing, so neither is shown.</span>;
  }
  if (compact) {
    return (
      <span>
        <span class="mono">{kg(nameplate_kg)}</span> <span class="t-label-small muted">{words(confidence)}</span>
      </span>
    );
  }
  return (
    <div>
      <div class="figure-value">{kg(nameplate_kg)}</div>
      <ul class="dep-list">
        <li>Confidence: {words(confidence)}</li>
        {basis ? <li>Basis: {basis}</li> : null}
      </ul>
    </div>
  );
}

/* --- The energy panel: location-based and market-based side by side, never
   one alone, with the retired instruments beneath. -------------------- */

export function EnergyPanel({ carbon }) {
  if (!carbon || carbon.energy_location_mg_per_kg == null || carbon.energy_market_mg_per_kg == null) {
    return <p class="note">The two energy figures are returned together or not at all. One is missing, so neither is shown.</p>;
  }
  return (
    <div class="card">
      <h3>Energy</h3>
      <div class="grid-2" style="margin-top:0.75rem">
        <div>
          <div class="t-label-small muted">Location-based</div>
          <div class="figure-value">{mgPerKg(carbon.energy_location_mg_per_kg)}</div>
        </div>
        <div>
          <div class="t-label-small muted">Market-based</div>
          <div class="figure-value">{mgPerKg(carbon.energy_market_mg_per_kg)}</div>
        </div>
      </div>
      <hr class="rule" style="margin:1rem 0" />
      <table>
        <caption class="visually-hidden">Retired energy instruments and the unmatched consumption</caption>
        <thead>
          <tr>
            <th scope="col">Instrument</th>
            <th scope="col">Vintage</th>
            <th scope="col">Region</th>
            <th scope="col" class="num">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {(carbon.retired_instruments || []).length ? (
            (carbon.retired_instruments || []).map((i) => (
              <tr key={i.reference}>
                <td class="mono">{i.reference}</td>
                <td class="mono">{i.vintage}</td>
                <td>{i.region}</td>
                <td class="num">{Number(i.quantity_kwh).toLocaleString('en-GB')}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4" class="note">No instrument is retired against this period.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p class="note" style="margin-top:0.75rem">
        Metered {Number(carbon.metered_kwh || 0).toLocaleString('en-GB')} kWh, retired {Number(carbon.retired_kwh || 0).toLocaleString('en-GB')} kWh.{' '}
        <strong>Unmatched consumption: {Number(carbon.unmatched_kwh || 0).toLocaleString('en-GB')} kWh.</strong>
      </p>
    </div>
  );
}

/* --- shared surfaces ------------------------------------------------- */

export function Loading({ what = 'this surface' }) {
  return (
    <p class="loading" role="status">
      Loading {what}.
    </p>
  );
}

export function Empty({ children }) {
  return <p class="empty">{children}</p>;
}

// A refused act renders an inline banner naming what was refused and what
// would change it.
export function RefusalBanner({ error, onDismissLabel = null }) {
  if (!error) return null;
  const b = error.body || {};
  return (
    <div class="banner" role="alert">
      <h3>This act was refused.</h3>
      <p>{b.detail || error.message}</p>
      {b.available_g !== undefined && b.requested_g !== undefined ? (
        <p class="mono">
          This allocation is refused. Available: {Number(b.available_g).toLocaleString('en-GB')} g. Requested: {Number(b.requested_g).toLocaleString('en-GB')} g.
        </p>
      ) : null}
      {b.blocking ? (
        <ul>
          {b.blocking.map((x, i) => (
            <li key={i}>
              {words(x.condition)} — <span class="mono">{x.reference}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {b.error ? <p class="note mono">{b.error}</p> : null}
      {onDismissLabel}
    </div>
  );
}

export function Derivation({ children }) {
  return <p class="note">{children}</p>;
}

export function Ref({ children, href = null }) {
  if (href) {
    return (
      <Link href={href} class="mono">
        {children}
      </Link>
    );
  }
  return <span class="mono">{children}</span>;
}

export { grams, bp, bpAsPercent, mgPerKg, kg, words, dateOf };
