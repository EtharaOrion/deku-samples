import { useState } from 'preact/hooks';

export default function CameraDetail({ camera }) {
  const [nickname, setNickname] = useState(camera.nickname || '');
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('vela_token') : null;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const call = (path, method, body) => fetch(path, { method, credentials: 'same-origin', headers, body: body ? JSON.stringify(body) : undefined });

  const rename = async () => {
    setErr(null); setMsg(null);
    const res = await call(`/api/account/devices/${camera.serial}`, 'PATCH', { nickname });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(body?.error?.message || 'That did not work.'); return; }
    setMsg('Renamed.');
  };

  const remove = async () => {
    if (!window.confirm('Remove this camera from your account? It is not given to anyone.')) return;
    const res = await call(`/api/account/devices/${camera.serial}`, 'DELETE');
    if (res.ok) window.location.href = '/account/cameras';
  };

  const handOver = async () => {
    if (!window.confirm('Release this camera so someone else can register it?')) return;
    const res = await call(`/api/account/devices/${camera.serial}`, 'DELETE');
    if (res.ok) window.location.href = '/account/cameras';
  };

  return (
    <div class="camera-detail">
      <nav class="crumbs"><a href="/account/cameras">Cameras</a> / <span class="mono">{camera.serial}</span></nav>
      <h1>{camera.model}</h1>
      <p class="muted">{camera.variant_title}. Serial <span class="mono">{camera.serial}</span>.</p>
      <dl class="dl">
        <dt>Firmware</dt><dd class="mono">{camera.firmware_version || 'Not yet connected'}</dd>
        {camera.firmware_version && camera.latest_firmware && camera.firmware_version !== camera.latest_firmware ? (
          <><dt>Newer firmware</dt><dd><span class="chip chip-warn">Update available</span> <span class="mono">{camera.latest_firmware}</span></dd></>
        ) : null}
        <dt>Warranty</dt><dd>{camera.warranty_until ? new Date(camera.warranty_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'No date'}</dd>
        <dt>Last heard from</dt>
        <dd>{camera.firmware_reported_at ? new Date(camera.firmware_reported_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Never'}</dd>
      </dl>
      <div class="row">
        <label for="nickname">Nickname</label>
        <input id="nickname" value={nickname} onInput={(e) => setNickname(e.target.value)} />
        <button class="btn" onClick={rename}>Rename</button>
      </div>
      {msg ? <p class="ok-text" role="status">{msg}</p> : null}
      {err ? <p class="error-text" role="alert">{err}</p> : null}
      <div class="actions">
        <button class="btn btn-danger" onClick={remove}>Remove from my account</button>
        <p class="muted small">Removing releases the camera without giving it to anyone. It is what you do when you sell it to a stranger.</p>
        <button class="btn" onClick={handOver}>Hand this camera to someone else</button>
        <p class="muted small">Handing over ends your link so the next owner can register the same serial.</p>
      </div>
    </div>
  );
}
