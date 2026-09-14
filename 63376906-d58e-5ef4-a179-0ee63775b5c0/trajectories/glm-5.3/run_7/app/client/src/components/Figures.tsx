// The three figures that never render alone.
import { pct } from '../lib/api';

export function ContentFigure({ content_bp, claim_type, compact = false }: { content_bp: number; claim_type: string; compact?: boolean }) {
  if (content_bp === undefined || content_bp === null || !claim_type) return null;
  return (
    <span class="figure-pair">
      <span class="figures">{pct(content_bp)}</span>
      <span class={compact ? 'label' : ''}>{compact ? claim_type.replace(/_/g, ' ') : ' — ' + claim_type.replace(/_/g, ' ')}</span>
    </span>
  );
}

export function CarbonFigure({ carbon }: { carbon: any }) {
  if (!carbon || carbon.value_mg_per_kg === undefined || !carbon.boundary || !carbon.method_version || carbon.uncertainty_bp === undefined) {
    return null;
  }
  return (
    <span class="figure-carbon">
      <span class="figures">{Number(carbon.value_mg_per_kg).toLocaleString('en-GB')}</span>
      <span class="label"> mg CO2e/kg · {carbon.boundary} · {carbon.method_version} · uncertainty {carbon.uncertainty_bp} bp</span>
    </span>
  );
}

export function CapacityFigure({ value_kg, confidence, label }: { value_kg: number; confidence: string; label: string }) {
  if (value_kg === undefined || value_kg === null || !confidence) return null;
  return (
    <span class="figure-capacity">
      <span class="figures">{Number(value_kg).toLocaleString('en-GB')} kg/yr</span>
      <span class="label"> {label} · {confidence.replace(/_/g, ' ')}</span>
    </span>
  );
}

export function StateWord({ state }: { state: string }) {
  return <span class={'state-word ' + state}>{state.replace(/_/g, ' ')}</span>;
}

export function Loading({ what = 'This surface' }: { what?: string }) {
  return <p class="label" role="status">{what} is loading.</p>;
}

export function Empty({ what }: { what: string }) {
  return <p class="notice">There are no {what} yet. Nothing has been recorded against this collection.</p>;
}

export function Banner({ kind, title, children }: { kind?: string; title: string; children?: any }) {
  return (
    <div class={'banner' + (kind ? ' ' + kind : '')} role="alert">
      <span class="label">{title}</span>
      <div>{children}</div>
    </div>
  );
}

export function FlagWords({ flags }: { flags: string[] }) {
  if (!flags || flags.length === 0) return null;
  return (
    <span class="flag-words">
      {flags.map((f) => <StateWord key={f} state={f} />)}
    </span>
  );
}

// Inline vectors, each with a text label beside it, so a vector that fails to
// load costs nothing.
export function VectorIcon({ kind, label }: { kind: 'flag' | 'lock' | 'arrow' | 'warning'; label: string }) {
  const paths: Record<string, any> = {
    flag: <path d="M6 3v18M6 4h11l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="1.6" />,
    lock: <><rect x="5" y="10" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.6" /></>,
    arrow: <path d="M4 12h15m0 0-5-5m5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" />,
    warning: <><path d="M12 4 2.5 20h19L12 4Z" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M12 10v5" stroke="currentColor" stroke-width="1.6" /><circle cx="12" cy="17.6" r="0.9" fill="currentColor" /></>
  };
  return (
    <span class="vector-with-label">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{paths[kind]}</svg>
      <span>{label}</span>
    </span>
  );
}
