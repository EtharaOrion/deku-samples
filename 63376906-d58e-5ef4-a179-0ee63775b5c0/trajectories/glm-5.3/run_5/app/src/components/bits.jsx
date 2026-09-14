import { fmtState } from '../format.js';

export function Banner({ kind = 'note', title, children }) {
  return (
    <div class={`banner ${kind}`} role={kind === 'refused' ? 'alert' : 'status'}>
      {title ? <strong>{title}. </strong> : null}
      {children}
    </div>
  );
}

export function Empty({ children }) {
  return <div class="empty">{children}</div>;
}

export function Loading({ children = 'Reading the records…' }) {
  return <p class="loading" role="status">{children}</p>;
}

// A state carried by its word as well as any other signal.
export function WordState({ state }) {
  return <span class="wordstate" data-state={state}>{fmtState(state)}</span>;
}

export function Ref({ children }) {
  return <span class="mono figure">{children}</span>;
}
