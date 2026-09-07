import { useState } from 'preact/hooks';
import { groupSerial } from '../lib/format.js';

const SHAPE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

/**
 * Registration happens in place at the top of the grid: one field for the
 * serial, grouped as it is typed and stored unformatted, validated for shape
 * instantly and then looked up.
 */
export default function RegisterRow() {
  const [value, setValue] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(null);

  const raw = value.replace(/[^0-9A-Z]/g, '');
  // Validated for shape instantly, before any lookup happens.
  const shapeOk = SHAPE.test(raw);
  const shapeMessage = raw.length === 12 && !shapeOk
    ? 'We do not recognise that serial number.'
    : null;

  async function submit(event) {
    event.preventDefault();
    if (!shapeOk || state === 'working') return;
    setState('working');
    setError(null);
    setAdded(null);
    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serial: raw }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState('error');
        // Never the other person's identity.
        setError(body.message || 'That did not work.');
        return;
      }
      setState('done');
      setAdded(body);
      setValue('');
      // Success adds the card; the page is re-read so the grid is the server's
      // answer rather than a guess made here.
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setState('error');
      setError('That did not work. Check your connection and try again.');
    }
  }

  return (
    <form class="register" onSubmit={submit}>
      <div class="field">
        <label for="serial">Register a camera</label>
        <input
          class="input ident"
          id="serial"
          name="serial"
          value={value}
          maxLength={14}
          spellcheck={false}
          autocomplete="off"
          placeholder="VA26 09KT MHX4"
          aria-describedby="serial-hint"
          aria-invalid={shapeMessage ? 'true' : undefined}
          onInput={(e) => setValue(groupSerial(e.currentTarget.value))}
        />
        <span class="hint" id="serial-hint">Twelve characters, engraved on the underside.</span>
      </div>

      <button type="submit" class="btn btn-primary" disabled={!shapeOk || state === 'working'}>
        {state === 'working' ? 'Checking' : 'Register'}
      </button>

      <p class="live" role="status" aria-live="polite">
        {shapeMessage && <span class="error-text">{shapeMessage}</span>}
        {error && <span class="error-text">{error}</span>}
        {/* A brief confirmation that fades on its own. A notice about a price
            or an availability change never does that. */}
        {added && <span class="added">Registered. {added.model} is on your account.</span>}
      </p>

      <style>{`
        .register {
          display: grid;
          grid-template-columns: minmax(0, 320px) auto;
          gap: calc(var(--space) * 3);
          align-items: end;
          border: var(--border-w) solid var(--rule);
          border-radius: var(--radius);
          padding: calc(var(--space) * 4);
          background: var(--bg-raised);
        }
        .live { grid-column: 1 / -1; min-height: 21px; font-size: 14px; }
        .added { animation: fade-out 400ms var(--ease) 3s forwards; }
        @keyframes fade-out { to { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .added { animation: none; }
        }
        @media (max-width: 63.999rem) {
          .register { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
    </form>
  );
}
