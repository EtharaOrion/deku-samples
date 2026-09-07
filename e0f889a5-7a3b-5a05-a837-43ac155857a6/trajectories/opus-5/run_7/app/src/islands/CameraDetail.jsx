import { useState } from 'preact/hooks';
import { api, announce } from '../lib/client.js';

/**
 * Renaming and releasing. Removing and handing over are different actions and the
 * copy never blurs them; every destructive action confirms first and Escape closes
 * the confirmation.
 */
export default function CameraDetail({ device }) {
  const [nickname, setNickname] = useState(device.nickname || '');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const rename = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api(`/account/devices/${encodeURIComponent(device.serial)}`, {
        method: 'PATCH', body: { nickname: nickname.trim() || null }, auth: true,
      });
      setSaved(true);
      announce('The name was saved.');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    }
  };

  const release = async () => {
    setError(null);
    try {
      await api(`/account/devices/${encodeURIComponent(device.serial)}`, { method: 'DELETE', auth: true });
      window.location.assign('/account/cameras');
    } catch (err) {
      setConfirming(false);
      setError(err.message);
    }
  };

  return (
    <div>
      <section class="section" aria-labelledby="name-h">
        <h2 class="section-title" id="name-h">Name</h2>
        <form onSubmit={rename} style="max-width:26rem">
          <label class="field">
            <span class="label">What you call this camera</span>
            <input
              class="input"
              value={nickname}
              onInput={(e) => setNickname(e.currentTarget.value)}
              maxLength={60}
              placeholder={device.model}
            />
            <span class="field-hint">Only you see this.</span>
          </label>
          <button type="submit" class="btn btn-secondary">Save the name</button>
          {saved && <p class="small" style="margin-top:calc(var(--unit)*2);color:var(--done)">The name was saved.</p>}
        </form>
      </section>

      <section class="section" aria-labelledby="release-h">
        <h2 class="section-title" id="release-h">Removing this camera</h2>

        <div style="max-width:52rem">
          <p class="small" style="margin-bottom:calc(var(--unit)*4)">
            <strong>Remove from my account</strong> releases the camera without giving it
            to anyone. It is what you do when you sell it to a stranger: they can then
            register it themselves.
          </p>
          <p class="small muted" style="margin-bottom:calc(var(--unit)*5)">
            <strong>Hand this camera to someone else</strong> is a different action and we
            do not offer it here. Remove it, then give them the serial number.
          </p>

          {error && <p class="field-error" role="alert" style="margin-bottom:calc(var(--unit)*3)">{error}</p>}

          {confirming ? (
            <div
              class="notice notice-danger"
              role="alertdialog"
              aria-label="Confirm removal"
              tabIndex={-1}
              onKeyDown={(e) => { if (e.key === 'Escape') setConfirming(false); }}
            >
              <p style="font-weight:700">Remove {device.serial} from your account?</p>
              <p class="small" style="margin-top:var(--unit)">
                This releases the camera and grants it to nobody. You can register it again later.
              </p>
              <div class="row" style="gap:calc(var(--unit)*3);margin-top:calc(var(--unit)*3)">
                <button type="button" class="btn" onClick={release}>Remove it from my account</button>
                <button type="button" class="btn btn-secondary" onClick={() => setConfirming(false)}>Keep it</button>
              </div>
            </div>
          ) : (
            <button type="button" class="btn btn-secondary" onClick={() => setConfirming(true)}>
              Remove from my account
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
