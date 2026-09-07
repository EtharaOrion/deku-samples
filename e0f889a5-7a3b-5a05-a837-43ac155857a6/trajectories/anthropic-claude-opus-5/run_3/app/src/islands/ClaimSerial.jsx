import { useState } from 'preact/hooks';

/** Each unregistered serial carries a one-click control to register it. */
export default function ClaimSerial({ serial }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  async function claim() {
    setState('working');
    setError(null);
    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serial }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState('idle');
        setError(body?.message || 'That did not work.');
        return;
      }
      setState('done');
    } catch {
      setState('idle');
      setError('That did not work.');
    }
  }

  if (state === 'done') {
    return (
      <span class="claimed small" role="status">
        Registered to you.
        <style>{`.claimed { color: var(--done); }`}</style>
      </span>
    );
  }

  return (
    <span class="claim">
      <button
        type="button"
        class="btn btn--secondary btn--small"
        onClick={claim}
        disabled={state === 'working'}
      >
        {state === 'working' ? 'Registering' : 'Register to my account'}
      </button>
      {error && (
        <span class="claim__error small" role="alert">
          {error}
        </span>
      )}
      <style>{`
        .claim { display: inline-flex; align-items: center; gap: calc(var(--unit) * 2); flex-wrap: wrap; }
        .claim__error { color: var(--error); }
      `}</style>
    </span>
  );
}
