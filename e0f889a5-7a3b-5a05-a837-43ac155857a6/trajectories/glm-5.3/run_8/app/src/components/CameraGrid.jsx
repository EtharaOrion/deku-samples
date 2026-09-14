import { useState } from 'preact/hooks';

const SERIAL_RE = /^(VA|VC)\d{2}\d{2}[2-9A-HJ-NP-Z]{6}$/;

function groupSerial(v) {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return s.replace(/^(.{2})(.{2})(.{2})(.{4})(.{2})$/, '$1$2$3 $4 $5').replace(/^(.{10})(.{2})$/, '$1 $2');
}

export default function CameraGrid({ initial = [], prefill = '' }) {
  const [cameras, setCameras] = useState(initial);
  const [serial, setSerial] = useState(prefill);
  const [err, setErr] = useState(null);
  const [justAdded, setJustAdded] = useState(null);
  const [busy, setBusy] = useState(false);

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vela_token') : null;
  const authHeaders = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const raw = serial.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const shapeOk = SERIAL_RE.test(raw);

  const register = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!shapeOk) { setErr('A serial is twelve characters, engraved under the camera.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST', credentials: 'same-origin', headers: authHeaders,
        body: JSON.stringify({ serial: raw }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.error?.message || 'That did not work.'); return; }
      const r2 = await fetch(`/api/account/devices/${raw}`, { credentials: 'same-origin', headers: authHeaders });
      const d = await r2.json();
      setCameras([{ serial: d.serial, nickname: d.nickname, model: d.model, variant_title: d.variant_title, firmware_version: d.firmware_version, latest_firmware: d.latest_firmware, warranty_until: d.warranty_until ? new Date(d.warranty_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null }, ...cameras.filter((c) => c.serial !== d.serial)]);
      setSerial('');
      setJustAdded(d.serial);
      setTimeout(() => setJustAdded(null), 4000);
    } finally { setBusy(false); }
  };

  return (
    <div>
      <form class="register card" onSubmit={register}>
        <div class="reg-field">
          <label for="serial">Register a camera by its serial</label>
          <input
            id="serial" class="mono" inputmode="text" autocomplete="off" spellcheck="false"
            placeholder="VC26 09PV DA7Q"
            value={groupSerial(serial)}
            onInput={(e) => setSerial(e.target.value)}
            aria-describedby="serial-help serial-state"
          />
          <span id="serial-help" class="muted small">Grouped as it is typed. Stored unformatted.</span>
          <span id="serial-state" class="muted small" role="status">
            {raw.length === 0 ? '' : shapeOk ? 'That looks right.' : 'Twelve characters, capitals, no I, O, 0 or 1.'}
          </span>
        </div>
        <button class="btn btn-primary" type="submit" disabled={busy || !shapeOk}>Register</button>
        {err ? <p class="error-text" role="alert">{err}</p> : null}
        {justAdded ? <p class="ok-text flash-confirm" role="status">Added to your account.</p> : null}
      </form>

      {cameras.length === 0 ? (
        <p class="empty card">No cameras registered yet.</p>
      ) : (
        <ul class="camera-grid">
          {cameras.map((d) => (
            <li class="card">
              <h2><a href={`/account/cameras/${d.serial}`}>{d.model}</a></h2>
              {d.nickname ? <p class="muted">“{d.nickname}”</p> : null}
              <p class="mono">{d.serial}</p>
              <p class="muted small">{d.variant_title}</p>
              <div class="chips">
                <span class="chip">{d.firmware_version ? `Firmware ${d.firmware_version}` : 'Not yet connected'}</span>
                {d.firmware_version && d.latest_firmware && d.firmware_version !== d.latest_firmware
                  ? <span class="chip chip-warn">Update available</span> : null}
                <span class="chip">{d.warranty_until ? `Warranty to ${d.warranty_until}` : 'No warranty date'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
