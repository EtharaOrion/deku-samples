import { useEffect, useState } from 'preact/hooks';
import { api } from '../lib/api.js';

export function useResource(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) { setState({ loading: false, data: null, error: null }); return; }
    let live = true;
    setState({ loading: true, data: null, error: null });
    api(path)
      .then((d) => live && setState({ loading: false, data: d, error: null }))
      .catch((e) => live && setState({ loading: false, data: null, error: e }));
    return () => { live = false; };
  }, [path, nonce, ...deps]);
  return { ...state, reload: () => setNonce((n) => n + 1) };
}

// A scoped read answers read_at, the moment the read saw, so a reader knows
// which state was consistent.
export function ReadAt({ at }) {
  if (!at) return null;
  return (
    <p class="note" style="margin:.5rem 0 0">
      Read at <span class="mono">{String(at).replace('T', ' ').slice(0, 19)} UTC</span>.
      This is the moment the read saw.
    </p>
  );
}

// Every figure links to the records it came from.
export function Derivation({ derivation }) {
  if (!derivation) return null;
  const entries = Object.entries(derivation);
  if (!entries.length) return null;
  return (
    <details style="margin-top:1rem">
      <summary class="label" style="cursor:pointer">Where these figures came from</summary>
      <dl style="margin:.75rem 0 0">
        {entries.map(([k, v]) => (
          <div key={k} style="margin-bottom:.5rem">
            <dt class="label" style="margin:0">{k.replace(/_/g, ' ')}</dt>
            <dd class="mono note" style="margin:0">
              {typeof v === 'string' ? v : JSON.stringify(v)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
