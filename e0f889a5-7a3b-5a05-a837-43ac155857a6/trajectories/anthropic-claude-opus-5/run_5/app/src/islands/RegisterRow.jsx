import { useEffect, useState } from 'preact/hooks';
import { groupSerial, unformatSerial } from '../lib/format.js';

const SERIAL_RE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

/**
 * Registration happens in place at the top of the grid: one field for the
 * serial, grouped as it is typed and stored unformatted, validated for shape
 * instantly and then looked up.
 */
export default function RegisterRow({ onRegistered }) {
  const [value, setValue] = useState('');
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const raw = unformatSerial(value);
  const complete = raw.length === 12;
  const shapeOk = SERIAL_RE.test(raw);
  // Validated for shape instantly, before any lookup happens.
  const shapeError = complete && !shapeOk ? 'We do not recognise that serial number.' : '';

  useEffect(() => {
    if (!confirmation) return undefined;
    // Success raises a brief confirmation that fades on its own. A notice about
    // a price or an availability change never does that.
    const timer = setTimeout(() => setConfirmation(''), 4000);
    return () => clearTimeout(timer);
  }, [confirmation]);

  async function submit(event) {
    event.preventDefault();
    if (!shapeOk || state === 'working') return;
    setState('working');
    setMessage('');
    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: raw }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setMessage(body.message || 'That did not work.');
        return;
      }
      setState('done');
      setValue('');
      setConfirmation(`${body.model} added to your account.`);
      onRegistered?.(body);
    } catch {
      setState('error');
      setMessage('That did not work.');
    }
  }

  return (
    <form class="card" onSubmit={submit}>
      <h2 class="section-title">Register a camera</h2>
      <p style="margin-top:0.25rem;color:var(--quiet);font-size:14px;line-height:21px">
        The serial is engraved on the underside, twelve characters.
      </p>

      <div class="row" style="margin-top:0.75rem;align-items:flex-end">
        <div class="field" style="flex:1;min-width:14rem">
          <label for="serial">Serial number</label>
          <input
            class="input mono"
            id="serial"
            name="serial"
            value={groupSerial(value)}
            onInput={(e) => setValue(unformatSerial(e.currentTarget.value))}
            placeholder="VC26 09PV DA7Q"
            autocomplete="off"
            spellcheck={false}
            aria-describedby="serial-status"
            aria-invalid={shapeError ? 'true' : undefined}
          />
        </div>
        <button
          class="button button--primary"
          type="submit"
          disabled={!shapeOk || state === 'working'}
          aria-disabled={!shapeOk || state === 'working'}
        >
          {state === 'working' ? 'Checking' : 'Register'}
        </button>
      </div>

      <p id="serial-status" role="status" aria-live="polite" style="margin-top:0.5rem;min-height:1.5rem">
        {shapeError && <span class="chip chip--wrong">{shapeError}</span>}
        {!shapeError && message && <span class="chip chip--wrong">{message}</span>}
        {!shapeError && !message && confirmation && (
          <span class="chip chip--done">{confirmation}</span>
        )}
      </p>
    </form>
  );
}
