import { useState } from 'preact/hooks';
import { api, announce } from '../lib/client.js';

/** One control that registers a serial from the order it was bought on. */
export default function RegisterSerialButton({ serial }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  const register = async () => {
    setState('working');
    setError(null);
    try {
      await api('/account/devices', { method: 'POST', body: { serial }, auth: true });
      setState('done');
      announce(`${serial} is on your account.`);
    } catch (err) {
      setState('idle');
      setError(err.message);
      announce(err.message);
    }
  };

  if (state === 'done') return <span class="chip chip-done">Registered</span>;

  return (
    <span>
      <button type="button" class="btn btn-secondary btn-sm" onClick={register} disabled={state === 'working'}>
        {state === 'working' ? 'Registering' : 'Register to my account'}
      </button>
      {error && <span class="field-error" role="alert" style="display:block">{error}</span>}
    </span>
  );
}
