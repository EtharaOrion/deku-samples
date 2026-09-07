import { useEffect, useState } from 'preact/hooks';
import { api, announce } from '../lib/client.js';

function formatDate(value) {
  if (!value) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? String(value)
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Group the serial as it is typed; it is stored unformatted. */
function groupSerial(raw) {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return clean.replace(/(.{4})(?=.)/g, '$1-');
}
const unformat = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const SHAPE = /^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export default function CameraGrid({ initialDevices = null, prefillSerial = '' }) {
  const [devices, setDevices] = useState(initialDevices);
  const [loading, setLoading] = useState(initialDevices === null);
  const [failed, setFailed] = useState(false);
  const [value, setValue] = useState(prefillSerial ? groupSerial(prefillSerial) : '');
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);
  const [confirming, setConfirming] = useState(null);

  const clean = unformat(value);
  // Validated for shape instantly, then looked up.
  const shapeOk = clean.length === 0 || SHAPE.test(clean);
  const ready = SHAPE.test(clean);

  const load = async () => {
    try {
      const d = await api('/account/devices?page_size=100', { auth: true });
      setDevices(d.data);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (initialDevices === null) load(); }, []);

  // Success raises a brief confirmation that fades on its own.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  const register = async (e) => {
    e?.preventDefault();
    if (!ready) return;
    setState('working');
    setError(null);
    try {
      const d = await api('/account/devices', { method: 'POST', body: { serial: clean }, auth: true });
      setDevices((list) => [...(list || []), d.device]);
      setValue('');
      setFlash(`${d.device.serial} is on your account.`);
      announce(`${d.device.model} added to your account.`);
      setState('idle');
    } catch (err) {
      setState('idle');
      setError(err.message);
      announce(err.message);
    }
  };

  const release = async (serial) => {
    setConfirming(null);
    try {
      await api(`/account/devices/${encodeURIComponent(serial)}`, { method: 'DELETE', auth: true });
      setDevices((list) => list.filter((d) => d.serial !== serial));
      setFlash(`${serial} was removed from your account.`);
      announce(`${serial} removed.`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div id="live-region" role="status" aria-live="polite" class="visually-hidden"></div>

      {/* Registration happens in place at the top of the grid. */}
      <form class="card" onSubmit={register} style="margin-bottom:calc(var(--unit)*6)">
        <div class="row" style="gap:calc(var(--unit)*4);align-items:flex-start">
          <label style="flex:1;min-width:16rem">
            <span class="label" style="display:block;font-weight:700;font-size:14px;margin-bottom:calc(var(--unit)*1.5)">
              Register a camera
            </span>
            <input
              class="input serial"
              value={value}
              onInput={(e) => setValue(groupSerial(e.currentTarget.value))}
              placeholder="VC26-09PV-DA7Q"
              maxLength={14}
              aria-invalid={!shapeOk ? 'true' : undefined}
              aria-describedby="serial-help"
            />
            <span class="field-hint" id="serial-help">
              {!shapeOk
                ? 'A serial is twelve characters: two letters, four digits, then six more.'
                : 'Twelve characters, engraved on the underside of the camera.'}
            </span>
          </label>
          <button type="submit" class="btn" disabled={!ready || state === 'working'} style="margin-top:26px">
            {state === 'working' ? 'Registering' : 'Register'}
          </button>
        </div>

        {error && <p class="field-error" role="alert" style="margin-top:calc(var(--unit)*2)">{error}</p>}
      </form>

      {flash && (
        <div class="notice notice-done" role="status" style="margin-bottom:calc(var(--unit)*5)">
          <p>{flash}</p>
        </div>
      )}

      {loading ? (
        <div class="grid-3" aria-busy="true">
          <span class="visually-hidden">Loading your cameras.</span>
          {[0, 1, 2].map((i) => (
            <div class="card" key={i}>
              <div class="skeleton" style="height:20px;width:60%"></div>
              <div class="skeleton" style="height:16px;width:40%;margin-top:12px"></div>
              <div class="skeleton" style="height:16px;width:70%;margin-top:12px"></div>
            </div>
          ))}
        </div>
      ) : failed ? (
        <div class="notice notice-danger" role="alert"><p>We could not load your cameras. Reload the page to try again.</p></div>
      ) : !devices || devices.length === 0 ? (
        <div class="empty"><p>No cameras registered yet.</p></div>
      ) : (
        <div class="grid-3">
          {devices.map((d) => (
            <article class="card" key={d.serial}>
              <h3 style="font-size:16px;line-height:24px">
                <a href={`/account/cameras/${d.serial}`} style="text-decoration:none">{d.nickname || d.model}</a>
              </h3>
              <p class="small muted">{d.model} — {d.option_value}</p>
              <p class="serial small" style="margin-top:calc(var(--unit)*2)">{d.serial}</p>

              <div class="row" style="margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*2)">
                {d.never_connected ? (
                  <span class="chip">Not yet connected</span>
                ) : d.update_available ? (
                  <span class="chip chip-progress">Update available</span>
                ) : (
                  <span class="chip chip-done">Firmware {d.firmware_version}</span>
                )}
                {/* An expired warranty is a neutral state, never a warning. */}
                {d.warranty_until && (
                  <span class="chip">
                    {d.warranty_expired ? 'Warranty ended' : `Warranty to ${formatDate(d.warranty_until)}`}
                  </span>
                )}
              </div>

              {confirming === d.serial ? (
                <div class="notice" style="margin-top:calc(var(--unit)*3)">
                  <p class="small">Remove {d.serial} from your account? This gives it to nobody.</p>
                  <div class="row" style="gap:calc(var(--unit)*2);margin-top:calc(var(--unit)*2)">
                    <button type="button" class="btn btn-sm" onClick={() => release(d.serial)}>Remove it</button>
                    <button type="button" class="btn btn-secondary btn-sm" onClick={() => setConfirming(null)}>Keep it</button>
                  </div>
                </div>
              ) : (
                <div class="row" style="margin-top:calc(var(--unit)*3);gap:calc(var(--unit)*3)">
                  <a class="small" href={`/account/cameras/${d.serial}`}>Details</a>
                  {/* Removing releases the camera without giving it to anyone. */}
                  <button type="button" class="btn-quiet" onClick={() => setConfirming(d.serial)}>
                    Remove from my account
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
