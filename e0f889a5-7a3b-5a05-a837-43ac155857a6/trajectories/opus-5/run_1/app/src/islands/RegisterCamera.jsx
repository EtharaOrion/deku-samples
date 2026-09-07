import { useState } from 'preact/hooks';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SHAPE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

// Grouped as it is typed and stored unformatted.
const group = (raw) => {
  const clean = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  return clean.replace(/(.{4})(?=.)/g, '$1 ').trim();
};
const unformat = (value) => value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

export default function RegisterCamera({ onRegistered }) {
  const [value, setValue] = useState('');
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState('');

  const serial = unformat(value);
  // Validated for shape instantly and then looked up.
  const shapeOk = SHAPE.test(serial);
  const shapeMessage = serial.length === 0
    ? ''
    : serial.length < 12
      ? `${12 - serial.length} more character${12 - serial.length === 1 ? '' : 's'}.`
      : shapeOk
        ? 'That looks like one of ours.'
        : 'We do not recognise that serial number.';

  const submit = async (e) => {
    e.preventDefault();
    if (!shapeOk || state === 'working') return;
    setState('working');
    setMessage('');
    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serial }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState('error');
        setTone('wrong');
        setMessage(body.message || 'That did not work.');
        return;
      }
      setState('done');
      setTone('done');
      // Success raises a brief confirmation that fades on its own.
      setMessage(`${body.model} added to your account.`);
      setValue('');
      if (onRegistered) onRegistered(body);
      setTimeout(() => { setMessage(''); setState('idle'); }, 6000);
      // The card is added by re-reading the grid from the server.
      window.location.reload();
    } catch {
      setState('error');
      setTone('wrong');
      setMessage('That did not work. Check your connection and try again.');
    }
  };

  return (
    <form class="register-row card" onSubmit={submit}>
      <div class="register-field">
        <label class="field-label" for="serial-input">Register a camera</label>
        <input
          id="serial-input"
          class="input mono"
          type="text"
          value={value}
          onInput={(e) => setValue(group(e.currentTarget.value))}
          placeholder="VA26 09KT MHX4"
          autocomplete="off"
          spellcheck={false}
          aria-describedby="serial-help"
          aria-invalid={serial.length === 12 && !shapeOk ? 'true' : undefined}
        />
        <p class="field-hint" id="serial-help">
          Twelve characters from the underside of the camera. {shapeMessage}
        </p>
      </div>
      <button class="button" type="submit" disabled={!shapeOk || state === 'working'}>
        {state === 'working' ? 'Registering' : 'Register'}
      </button>
      <p
        class={`register-message ${tone === 'wrong' ? 'register-wrong' : tone === 'done' ? 'register-done' : ''}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
    </form>
  );
}
