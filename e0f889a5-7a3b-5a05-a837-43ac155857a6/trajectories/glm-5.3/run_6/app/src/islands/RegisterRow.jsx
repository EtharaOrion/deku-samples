import { createSignal, Show, For } from 'solid-js';
import { api, groupSerial, SERIAL_RE } from './lib.js';

// The register row at the top of the cameras grid. The serial is grouped as it
// is typed and stored unformatted, validated for shape instantly, then looked
// up.
export default function RegisterRow(props) {
  const [serial, setSerial] = createSignal('');
  const [state, setState] = createSignal('idle');
  const [message, setMessage] = createSignal('');
  const [shapeOk, setShapeOk] = createSignal(true);

  const onInput = (event) => {
    const raw = event.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    setSerial(raw);
    setShapeOk(raw.length === 0 || SERIAL_RE.test(raw));
    setMessage('');
    setState('idle');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!SERIAL_RE.test(serial())) {
      setShapeOk(false);
      setMessage('A serial is twelve characters, for example VC2609PVDA7Q.');
      return;
    }
    setState('working');
    setMessage('');
    try {
      const device = await api('/api/account/devices', {
        method: 'POST',
        body: { serial: serial() },
        token: props.token
      });
      setState('done');
      setMessage(`${device.model} added to your account.`);
      setSerial('');
      window.dispatchEvent(new CustomEvent('vela:device-registered', { detail: device }));
      setTimeout(() => setMessage(''), 6000);
    } catch (err) {
      setState('error');
      setMessage(err.message);
    }
  };

  return (
    <form class="register-row card" onSubmit={submit} novalidate>
      <div class="register-fields">
        <label for="serial">Register a camera</label>
        <input
          id="serial"
          class="mono"
          type="text"
          inputmode="text"
          autocomplete="off"
          spellcheck={false}
          placeholder="VC2609PVDA7Q"
          value={groupSerial(serial())}
          onInput={onInput}
          aria-invalid={!shapeOk()}
          aria-describedby="serial-help serial-status"
        />
        <p class="hint" id="serial-help">
          Twelve characters, engraved on the underside. Grouped here, stored unformatted.
        </p>
        <p id="serial-status" role="status" class="hint">
          <Show when={message()}>
            <span class={state() === 'error' ? 'err' : 'ok'}>{message()}</span>
          </Show>
        </p>
      </div>
      <button class="btn" type="submit" disabled={state() === 'working' || serial().length === 0}>
        {state() === 'working' ? 'Checking' : 'Register'}
      </button>
    </form>
  );
}
