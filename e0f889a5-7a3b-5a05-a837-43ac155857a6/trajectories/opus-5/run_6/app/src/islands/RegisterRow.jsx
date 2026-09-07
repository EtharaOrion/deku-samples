import { useState } from 'preact/hooks';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SHAPE = new RegExp(`^(VA|VC)\\d{4}[${ALPHABET}]{6}$`);

// Registration happens in place at the top of the grid: grouped as it is typed,
// stored unformatted, validated for shape instantly and then looked up.
export default function RegisterRow() {
  const [raw, setRaw] = useState('');
  const [state, setState] = useState('idle');
  const [problem, setProblem] = useState('');
  const [ok, setOk] = useState('');

  const clean = raw.replace(/[\s-]/g, '').toUpperCase();
  const grouped = clean.replace(/(.{4})(?=.)/g, '$1 ');
  const shapeOk = SHAPE.test(clean);
  const tooShort = clean.length < 12;

  const submit = async (e) => {
    e.preventDefault();
    setProblem('');
    setOk('');
    if (!shapeOk) {
      setProblem('We do not recognise that serial number.');
      return;
    }
    setState('working');
    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ serial: clean }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState('idle');
        setProblem(body.message || 'That did not work.');
        return;
      }
      setState('idle');
      setOk(`${body.model}, serial ${body.serial}, is on your account.`);
      setRaw('');
      window.setTimeout(() => window.location.reload(), 700);
    } catch {
      setState('idle');
      setProblem('That did not work. Check your connection and try again.');
    }
  };

  return (
    <form class="card register-row" onSubmit={submit} data-test="register-row">
      <div class="field" style="margin:0">
        <label for="serial">Register a camera by its serial number</label>
        <input
          id="serial"
          class="mono"
          type="text"
          value={grouped}
          maxLength={14}
          placeholder="VA26 09KT MHX4"
          autocomplete="off"
          spellcheck={false}
          onInput={(e) => setRaw(e.currentTarget.value)}
          data-test="serial-field"
          aria-describedby="serial-hint"
        />
        <p class="hint" id="serial-hint">
          Twelve characters, engraved on the underside. We store it unformatted.
        </p>
      </div>
      <button class="btn" type="submit" disabled={state === 'working' || tooShort} data-test="register-submit">
        {state === 'working' ? 'Registering' : 'Register'}
      </button>

      {problem ? (
        <p class="notice wrong" role="alert" style="margin:0" data-test="register-problem">
          {problem}
        </p>
      ) : null}
      {ok ? (
        <p class="notice done fading" role="status" style="margin:0" data-test="register-ok">
          Registered. {ok}
        </p>
      ) : null}
      {!problem && !ok && clean.length >= 12 && !shapeOk ? (
        <p class="notice wrong" role="status" style="margin:0">
          We do not recognise that serial number.
        </p>
      ) : null}

      <style>{`
        .register-row { display: grid; grid-template-columns: minmax(0, 24rem) auto; gap: calc(var(--unit) * 3); align-items: end; }
        .register-row .notice { grid-column: 1 / -1; }
        .fading { animation: fade-out 300ms linear 3s forwards; }
        @keyframes fade-out { to { opacity: 0; visibility: hidden; } }
        @media (max-width: 63.999rem) { .register-row { grid-template-columns: minmax(0, 1fr); } }
      `}</style>
    </form>
  );
}
