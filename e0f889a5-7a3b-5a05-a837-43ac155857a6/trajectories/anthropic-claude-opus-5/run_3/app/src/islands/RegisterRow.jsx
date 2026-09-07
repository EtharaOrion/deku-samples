import { useState } from 'preact/hooks';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SHAPE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

/**
 * Registration in place at the top of the camera grid: one field for the
 * serial, grouped as it is typed and stored unformatted, validated for shape
 * instantly and then looked up.
 */
export default function RegisterRow({ onRegistered }) {
  const [value, setValue] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const raw = value.replace(/[\s-]/g, '').toUpperCase();
  const shapeOk = SHAPE.test(raw);
  const complete = raw.length === 12;

  function onInput(ev) {
    const next = ev.currentTarget.value.replace(/[\s-]/g, '').toUpperCase().slice(0, 12);
    // Grouped as it is typed.
    setValue(next.replace(/(.{4})(?=.)/g, '$1 ').trim());
    setError(null);
  }

  async function submit(ev) {
    ev.preventDefault();
    if (!complete || state === 'working') return;

    if (!shapeOk) {
      // A serial that does not match the shape is refused before any lookup.
      setError('We do not recognise that serial number.');
      return;
    }

    setState('working');
    setError(null);
    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serial: raw }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState('idle');
        setError(body?.message || 'That did not work.');
        return;
      }
      setState('idle');
      setValue('');
      // Success raises a brief confirmation that fades on its own.
      setDone(`${body.device.model} added.`);
      setTimeout(() => setDone(null), 4000);
      if (onRegistered) onRegistered(body.device);
      else window.location.reload();
    } catch {
      setState('idle');
      setError('That did not work.');
    }
  }

  return (
    <form class="register" onSubmit={submit}>
      <div class="register__row">
        <label class="register__field">
          <span class="field__label">Register a camera</span>
          <input
            class="input serial"
            value={value}
            onInput={onInput}
            placeholder="VA26 09KT MHX4"
            aria-describedby="register-help"
            aria-invalid={error ? 'true' : undefined}
          />
        </label>
        <button class="btn" type="submit" disabled={!complete || state === 'working'}>
          {state === 'working' ? 'Checking' : 'Register'}
        </button>
      </div>

      <p id="register-help" class="small muted register__help">
        The serial is on the underside of the camera. Twelve characters.
      </p>

      {error && (
        <div class="notice notice--error register__msg" role="alert">
          <span class="notice__body">{error}</span>
        </div>
      )}

      {done && (
        <p class="register__done small" role="status">
          {done}
        </p>
      )}

      <style>{`
        .register { margin-bottom: calc(var(--unit) * 6); }
        .register__row { display: flex; gap: calc(var(--unit) * 3); align-items: flex-end; flex-wrap: wrap; }
        .register__field { flex: 1; min-width: 16rem; }
        .register__field .input { width: 100%; }
        .register__help { margin: calc(var(--unit) * 2) 0 0; }
        .register__msg { margin-top: calc(var(--unit) * 3); }
        /* A brief confirmation that fades on its own. A notice about a price or
           an availability change never does that. */
        .register__done { color: var(--done); margin: calc(var(--unit) * 2) 0 0; }
      `}</style>
    </form>
  );
}
