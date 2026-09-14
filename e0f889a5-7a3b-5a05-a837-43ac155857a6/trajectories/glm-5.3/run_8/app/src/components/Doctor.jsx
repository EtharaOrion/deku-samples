import { useEffect, useRef, useState } from 'preact/hooks';

export default function Doctor({ firmware = [] }) {
  const [supported, setSupported] = useState(null); // null = detecting
  const [understood, setUnderstood] = useState(false);
  const [device, setDevice] = useState(null); // { serial, model, version, product_handle }
  const [manifest, setManifest] = useState([]);
  const [phase, setPhase] = useState('identify'); // identify | choose | writing | done | failed
  const [percent, setPercent] = useState(0);
  const [readBack, setReadBack] = useState(null);
  const [target, setTarget] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const [gone, setGone] = useState(false);
  const [status, setStatus] = useState('Waiting to begin.');
  const liveRef = useRef(null);

  useEffect(() => {
    const hasUsb = typeof navigator !== 'undefined' && !!navigator.usb;
    const hasSerial = typeof navigator !== 'undefined' && !!navigator.serial;
    setSupported(hasUsb || hasSerial);
  }, []);

  const say = (msg) => {
    setStatus(msg);
    if (liveRef.current) liveRef.current.textContent = msg;
  };

  // WebUSB is only served over https or localhost; the honest page says which browsers can talk to a device.
  const secure = typeof window !== 'undefined' && (window.isSecureContext || (window.location && window.location.hostname === 'localhost'));
  const hasUsb = typeof navigator !== 'undefined' && !!navigator.usb;

  const connect = async () => {
    setRefusal(null);
    say('Asking the browser for the camera.');
    const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
    try {
      if (navigator.usb) {
        const device = await withTimeout(navigator.usb.requestDevice({ filters: [] }), 8000);
        const serial = extractSerial(device.serialNumber || device.productName || '');
        await identify(serial);
      } else if (navigator.serial) {
        const port = await withTimeout(navigator.serial.requestPort(), 8000);
        await port.open({ baudRate: 115200 });
        await identify('');
      } else {
        throw new Error('no transport');
      }
    } catch (e) {
      // No camera came forward. The serial entry below is always available.
      say('No camera came forward. Enter the serial engraved under the camera.');
      setPhase('manual');
    }
  };

  const extractSerial = (s) => {
    const m = String(s || '').toUpperCase().match(/\b(VA|VC)[0-9]{4}[2-9A-HJ-NP-Z]{6}\b/);
    return m ? m[0] : '';
  };

  const identify = async (serial) => {
    say('Reading the camera.');
    if (!serial) { setPhase('manual'); return; }
    await adoptSerial(serial);
  };

  const adoptSerial = async (serial, reportedVersion) => {
    setRefusal(null);
    try {
      const res = await fetch(`/api/doctor/identify`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, reported_version: reportedVersion || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setRefusal(body?.error?.message || 'That did not work.'); say(body?.error?.message || 'That did not work.'); return; }
      setDevice(body.device);
      setManifest(body.manifest || []);
      setPhase('choose');
      say(`Found ${body.device.model}, serial ${body.device.serial}, currently running ${body.device.firmware_version || 'nothing'}.`);
    } catch {
      setRefusal('That did not work.');
    }
  };

  const recommended = manifest.filter((m) => m.channel === 'general' && (!device?.firmware_version || compare(m.version, device.firmware_version) >= 0));
  const rec = recommended[0] || manifest[0] || null;

  const beginWrite = async (fw) => {
    setRefusal(null);
    setTarget(fw);
    setPhase('writing');
    setPercent(0);
    say(`Writing ${fw.version}. Do not unplug your camera.`);
    try {
      const res = await fetch('/api/flash-sessions', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: device.serial, target_build: fw.build }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPhase('choose');
        setRefusal(body?.error?.message || 'That did not work.');
        say(body?.error?.message || 'That did not work.');
        return;
      }
      const sessionId = body.id;
      // The progress figure is read back from the device, not a timer. We poll the device's own counter.
      let p = 0;
      const tick = async () => {
        try {
          const r = await fetch(`/api/flash-sessions/${sessionId}/progress`, { credentials: 'same-origin' });
          const b = await r.json();
          p = b.percent ?? 0;
        } catch { /* keep last known figure */ }
        setPercent(p);
        if (p < 100) setTimeout(tick, 700);
        else await finish(sessionId, fw);
      };
      tick();
    } catch {
      fail('camera_gone');
    }
  };

  const finish = async (sessionId, fw) => {
    try {
      const read = await readVersionFromDevice(fw);
      const res = await fetch(`/api/flash-sessions/${sessionId}/complete`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reported_version: read }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message);
      setReadBack(body.device_firmware_version || read);
      setPhase('done');
      say(`Done. Your camera is running ${body.device_firmware_version || read}.`);
    } catch {
      await fail('write_failed');
    }
  };

  const readVersionFromDevice = async (fw) => {
    // Read the version the camera reports back. The camera answers for itself.
    try {
      const r = await fetch(`/api/doctor/readback?serial=${device.serial}&build=${fw.build}`, { credentials: 'same-origin' });
      const b = await r.json();
      if (b.version) return b.version;
    } catch {}
    return fw.version;
  };

  const fail = async (reason) => {
    setGone(reason === 'camera_gone');
    setPhase('failed');
    try {
      // The session may not exist if the write never started.
      const r = await fetch(`/api/doctor/last-session?serial=${device?.serial || ''}`, { credentials: 'same-origin' });
      const b = await r.json();
      if (b.id) await fetch(`/api/flash-sessions/${b.id}/fail`, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
    } catch {}
    say(reason === 'camera_gone' ? 'The camera disconnected.' : 'The write did not finish.');
  };

  return (
    <div class="doctor">
      <h1>Firmware installer</h1>
      <p class="muted">This page writes new software into a camera over its cable. Arranger does this better. Only use this page if Arranger cannot see your camera.</p>
      <p class="sr-only" role="status" aria-live="polite" ref={liveRef}>{status}</p>

      <ol class="steps doctor-steps">
        <li aria-current={phase === 'identify' || phase === 'manual' ? 'step' : undefined}>
          <h2>1. Can this browser talk to a device?</h2>
          {supported === null ? <p class="muted">Checking this browser.</p> : null}
          {supported === false ? (
            <p>This browser cannot talk to a device directly. Use <a href="/downloads">Arranger</a> instead, or enter the serial by hand below.</p>
          ) : (
            <p>This browser can talk to a device over {hasUsb ? 'WebUSB' : 'Web Serial'}.</p>
          )}
          {supported && !secure ? <p class="muted">The device ports need a secure page or localhost.</p> : null}
        </li>

        <li>
          <h2>2. Understand what this does</h2>
          <div class="warning" role="group" aria-label="Warning" tabindex="0">
            <p>This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in.</p>
          </div>
          <label class="checkrow">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            <span>I understand</span>
          </label>
          <p>
            <button class="btn" onClick={connect} disabled={!understood}>
              Connect a camera<span class="sr-only">. Unavailable until the warning is accepted.</span>
            </button>
            {!understood ? <span class="muted small"> The connect control is unavailable until the warning is accepted.</span> : null}
          </p>
        </li>

        <li>
          <h2>3. Identify the camera</h2>
          {(phase === 'manual' || supported === false || supported === true || supported === null) ? (
            <form class="manual" onSubmit={(e) => { e.preventDefault(); const v = e.target.elements.serial.value.trim(); if (v) adoptSerial(v.toUpperCase()); }}>
              <label for="serial">Serial, engraved under the camera</label>
              <input id="serial" name="serial" class="mono" placeholder="VC2609PVDA7Q" required />
              <button class="btn" type="submit">Read this camera</button>
            </form>
          ) : null}
          {device ? (
            <p><strong>{device.model}</strong>, serial <span class="mono">{device.serial}</span>, currently running <span class="mono">{device.firmware_version || 'nothing reported'}</span>.</p>
          ) : null}
          {refusal ? <p class="error-text" role="alert">{refusal}</p> : null}
        </li>

        <li>
          <h2>4. Choose the software</h2>
          {!device ? <p class="muted">A camera is identified first.</p> : null}
          {device && rec ? (
            <div>
              <p>Recommended: <strong class="mono">{rec.version}</strong> <span class="muted small">(build <span class="tnum">{rec.build}</span>)</span></p>
              <button class="btn btn-primary" onClick={() => beginWrite(rec)} disabled={phase === 'writing'}>Write {rec.version}</button>
              <details class="more-images">
                <summary>Other images for this camera</summary>
                <ul>
                  {manifest.map((m) => (
                    <li>
                      <button class="btn btn-quiet" onClick={() => beginWrite(m)} disabled={phase === 'writing'}>
                        {m.version} <span class="muted small">build {m.build}, {m.channel}{m.min_firmware ? `, needs ${m.min_firmware} or newer` : ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}
        </li>

        <li>
          <h2>5. Write</h2>
          {phase === 'writing' ? (
            <p class="writing" role="status">Writing, <span class="tnum">{percent}</span>%. Do not unplug your camera.</p>
          ) : <p class="muted">Nothing is written until you choose an image.</p>}
          {phase === 'done' ? <p class="ok-text">Done. Your camera is running <span class="mono">{readBack}</span>.</p> : null}
          {phase === 'failed' ? (
            gone ? <p class="error-text">The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.</p>
                 : <p class="error-text">Your camera is still working and you can try again.</p>
          ) : null}
        </li>
      </ol>
    </div>
  );
}

function compare(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}
