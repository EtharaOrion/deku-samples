import { useState } from 'preact/hooks';

/**
 * Renaming and releasing.
 *
 * `Remove from my account` and `Hand this camera to someone else` are different
 * actions and the copy never blurs them: removing releases the camera without
 * giving it to anyone, and it is what a person does when they sell it to a
 * stranger.
 */
export default function CameraActions({ serial, nickname }) {
  const [name, setName] = useState(nickname ?? '');
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function rename(ev) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/devices/${encodeURIComponent(serial)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname: name }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || 'That did not work.');
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('That did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function release() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/account/devices/${encodeURIComponent(serial)}`, {
        method: 'DELETE',
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || 'That did not work.');
        setBusy(false);
        return;
      }
      window.location.assign('/account/cameras');
    } catch {
      setError('That did not work.');
      setBusy(false);
    }
  }

  return (
    <div class="actions">
      {error && (
        <div class="notice notice--error" role="alert">
          <span class="notice__body">{error}</span>
        </div>
      )}

      <form class="panel" onSubmit={rename}>
        <h2 class="section-title">Name this camera</h2>
        <label class="field">
          <span class="field__label">Nickname</span>
          <input
            class="input"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            placeholder="The one with the dented plate"
          />
        </label>
        <button class="btn btn--secondary" type="submit" disabled={busy}>
          Save name
        </button>
        {saved && (
          <p class="small saved" role="status">
            Saved.
          </p>
        )}
      </form>

      <section class="panel">
        <h2 class="section-title">Remove from my account</h2>
        <p class="muted small">
          This releases the camera without giving it to anyone. Do this when you sell it to a
          stranger. The camera keeps working and stays repairable.
        </p>

        {/* Every destructive action confirms first. Escape closes the overlay. */}
        {!confirming ? (
          <button class="btn btn--secondary" type="button" onClick={() => setConfirming(true)}>
            Remove from my account
          </button>
        ) : (
          <div
            class="confirm"
            role="group"
            aria-label="Confirm removal"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirming(false);
            }}
          >
            <p class="strong">Remove this camera from your account?</p>
            <div class="row">
              <button class="btn" type="button" onClick={release} disabled={busy}>
                {busy ? 'Removing' : 'Yes, remove it'}
              </button>
              <button
                class="btn btn--secondary"
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Keep it
              </button>
            </div>
          </div>
        )}
      </section>

      <section class="panel">
        <h2 class="section-title">Hand this camera to someone else</h2>
        <p class="muted small">
          Remove it from your account first. The next owner registers it with their own account
          using the serial on the underside. We do not move a camera between accounts for you.
        </p>
      </section>

      <style>{`
        .actions > * + * { margin-top: calc(var(--unit) * 4); }
        .saved { color: var(--done); margin: calc(var(--unit) * 2) 0 0; }
        .confirm {
          border: var(--border-w) solid var(--line-strong);
          border-radius: var(--radius);
          padding: calc(var(--unit) * 3);
        }
        .confirm p { margin: 0 0 calc(var(--unit) * 3); }
      `}</style>
    </div>
  );
}
