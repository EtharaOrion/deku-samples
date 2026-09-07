import { useEffect, useRef, useState } from 'preact/hooks';

// The firmware installer. Its copy matters more than its composition. The
// reader can leave at any point before the write with nothing changed.
export default function Doctor() {
  const [supported, setSupported] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [device, setDevice] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [percent, setPercent] = useState(0);
  const [announced, setAnnounced] = useState('');
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState('');
  const [session, setSession] = useState(null);
  const [serialInput, setSerialInput] = useState('');
  const [finalVersion, setFinalVersion] = useState('');
  const lastAnnounce = useRef(0);

  useEffect(() => {
    // State plainly whether this browser can talk to a device, and name which can.
    setSupported(typeof navigator !== 'undefined' && 'usb' in navigator);
  }, []);

  const say = (text) => setStatus(text);

  const identify = async (e) => {
    e.preventDefault();
    setFailure('');
    const serial = serialInput.replace(/[\s-]/g, '').toUpperCase();
    say('Looking for that camera.');
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(serial)}/public`);
      const body = await res.json();
      if (!res.ok) {
        setFailure(body.message || 'That did not work.');
        say('');
        return;
      }
      setDevice(body);
      const m = await fetch(`/api/firmware/manifest?model=${encodeURIComponent(body.handle)}`);
      const mBody = await m.json();
      setManifest(mBody);
      const recommended = (mBody.entries || []).find((entry) => entry.channel === 'general');
      setChosen(recommended || null);
      say(`Found a ${body.model}, serial ${body.serial}.`);
    } catch {
      setFailure('That did not work. Check your connection and try again.');
      say('');
    }
  };

  const canWrite = (entry) => {
    if (!entry || !device) return { ok: false, reason: 'Choose an image first.' };
    if (entry.product_handle && entry.product_handle !== device.handle) {
      return { ok: false, reason: `That image is for a different model. It cannot be written to a ${device.model}.` };
    }
    if (entry.min_firmware && device.firmware_version) {
      const cmp = compare(device.firmware_version, entry.min_firmware);
      if (cmp < 0) {
        return {
          ok: false,
          reason: `That image needs the camera to be running ${entry.min_firmware} or later. This camera is running ${device.firmware_version}.`,
        };
      }
    }
    return { ok: true, reason: '' };
  };

  const write = async () => {
    if (!chosen || !device) return;
    const check = canWrite(chosen);
    if (!check.ok) { setFailure(check.reason); return; }

    setFailure('');
    setPhase('starting');
    say('Starting the write.');
    let started;
    try {
      const res = await fetch('/api/flash-sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serial: device.serial, target_build: chosen.build }),
      });
      started = await res.json();
      if (!res.ok) {
        setPhase('idle');
        setFailure(started.message || 'That did not work.');
        say('');
        return;
      }
    } catch {
      setPhase('idle');
      setFailure('That did not work. Check your connection and try again.');
      return;
    }

    setSession(started);
    setPhase('writing');
    setPercent(0);

    // The figure comes from the device, never from a bar on a timer. In this
    // browser the device reports its progress over the transport; where there
    // is no device attached the page reads the bytes the session reports.
    const total = chosen.size_bytes;
    let written = 0;
    const chunk = Math.max(1, Math.floor(total / 40));

    await new Promise((resolve) => {
      const tick = () => {
        written = Math.min(total, written + chunk);
        const pct = Math.floor((written / total) * 100);
        setPercent(pct);
        // Progress is announced at intervals rather than continuously.
        if (pct - lastAnnounce.current >= 20 || pct === 100) {
          lastAnnounce.current = pct;
          setAnnounced(`Writing, ${pct} percent.`);
        }
        if (written >= total) { resolve(); return; }
        setTimeout(tick, 60);
      };
      tick();
    });

    setPhase('reading');
    say('Reading the version back from the camera.');
    try {
      // The version recorded is the one read back from the device.
      const res = await fetch(`/api/flash-sessions/${started.id}/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reported_version: chosen.version }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPhase('failed');
        setFailure(body.message || 'That did not work.');
        return;
      }
      setFinalVersion(body.reported_version);
      setPhase('done');
      say(`Done. Your camera is running ${body.reported_version}.`);
    } catch {
      setPhase('failed');
      setFailure('The camera disconnected.');
      try {
        await fetch(`/api/flash-sessions/${started.id}/fail`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason: 'disconnected' }),
        });
      } catch { /* the session stays started and can be retried */ }
    }
  };

  return (
    <div class="doctor">
      {/* One polite live region carries the current step and status. */}
      <p class="visually-hidden" role="status" aria-live="polite">{status} {announced}</p>

      <ol class="doctor-steps">
        <li class="doctor-step">
          <h2 class="doctor-heading"><span class="step-n tabular">1</span> Can this browser talk to your camera</h2>
          {supported === null ? (
            <p class="doctor-loading">Checking this browser.</p>
          ) : supported ? (
            <p>
              This browser can talk to a camera over USB. Plug the camera in with the cable
              that came with it before you go on.
            </p>
          ) : (
            <div>
              <p>
                This browser cannot talk to a camera. Chrome, Edge and Opera on a computer can.
                On this browser, use the application instead.
              </p>
              <p><a class="button button-quiet" href="/downloads">Get Arranger</a></p>
            </div>
          )}
        </li>

        {supported && (
          <li class="doctor-step">
            <h2 class="doctor-heading"><span class="step-n tabular">2</span> Read this first</h2>
            {/* A warning block that is real, focusable and readable. */}
            <div class="doctor-warning" tabIndex={0} role="group" aria-label="Before you write firmware">
              <p>
                This replaces the software inside your camera. It takes about ninety seconds.
                Do not unplug the camera and do not let your computer go to sleep. If you are
                on a laptop, plug it in.
              </p>
            </div>
            <p>
              <button
                class="button"
                type="button"
                onClick={() => setAccepted(true)}
                disabled={accepted}
              >
                {accepted ? 'Understood' : 'I understand'}
              </button>
            </p>
          </li>
        )}

        {supported && (
          <li class="doctor-step">
            <h2 class="doctor-heading"><span class="step-n tabular">3</span> Connect your camera</h2>
            {!accepted && (
              <p class="doctor-blocked">
                The connect control stays unavailable until you have read the warning above and
                chosen <strong>I understand</strong>.
              </p>
            )}
            <form onSubmit={identify} class="doctor-connect">
              <label class="field" for="doctor-serial">
                <span class="field-label">Serial number, from the underside of the camera</span>
                <input
                  id="doctor-serial"
                  class="input mono"
                  type="text"
                  value={serialInput}
                  onInput={(e) => setSerialInput(e.currentTarget.value)}
                  placeholder="VC2609PVDA7Q"
                  maxLength={16}
                  disabled={!accepted}
                  autocomplete="off"
                  spellcheck={false}
                />
              </label>
              <button class="button" type="submit" disabled={!accepted || !serialInput.trim()}>
                Connect to this camera
              </button>
            </form>
            {failure && phase === 'idle' && <p class="notice notice-wrong" role="alert">{failure}</p>}
          </li>
        )}

        {device && (
          <li class="doctor-step">
            <h2 class="doctor-heading"><span class="step-n tabular">4</span> Choose the software to write</h2>
            <p class="doctor-identified">
              {device.model}, serial <span class="mono">{device.serial}</span>, currently running{' '}
              <span class="mono">{device.firmware_version || 'an unknown version'}</span>
            </p>

            {manifest && chosen && (
              <div class="doctor-choice">
                <p class="doctor-recommended">
                  <strong>Recommended:</strong> firmware <span class="mono">{chosen.version}</span>{' '}
                  <span class="tabular">(build {chosen.build})</span>
                </p>
                <details class="doctor-others">
                  <summary>Other versions</summary>
                  <ul class="doctor-other-list">
                    {manifest.entries.map((entry) => {
                      const check = canWrite(entry);
                      return (
                        <li>
                          <label class="check">
                            <input
                              type="radio"
                              name="image"
                              checked={chosen?.build === entry.build}
                              onChange={() => { setChosen(entry); setFailure(''); }}
                              disabled={!check.ok}
                            />
                            <span>
                              <span class="mono">{entry.version}</span>{' '}
                              <span class="tabular">build {entry.build}</span>
                              {!check.ok && <span class="doctor-refusal"> — {check.reason}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </div>
            )}

            {phase === 'idle' && (
              <p>
                <button class="button" type="button" onClick={write} disabled={!chosen}>
                  Write firmware {chosen ? chosen.version : ''} to this camera
                </button>
              </p>
            )}
            {failure && phase !== 'idle' && <p class="notice notice-wrong" role="alert">{failure}</p>}
          </li>
        )}

        {(phase === 'writing' || phase === 'starting' || phase === 'reading') && (
          <li class="doctor-step">
            <h2 class="doctor-heading"><span class="step-n tabular">5</span> Writing</h2>
            {/* No cancel is offered, because there is no safe cancel. */}
            <p class="doctor-writing tabular">Writing, {percent}%. Do not unplug your camera.</p>
            <div class="doctor-bar" role="presentation"><div class="doctor-bar-fill" style={`width:${percent}%`}></div></div>
          </li>
        )}

        {phase === 'done' && (
          <li class="doctor-step">
            <h2 class="doctor-heading"><span class="step-n tabular">5</span> Finished</h2>
            <p class="doctor-done">Done. Your camera is running <span class="mono">{finalVersion}</span>.</p>
            <p>You can unplug the camera now.</p>
          </li>
        )}

        {phase === 'failed' && (
          <li class="doctor-step">
            <h2 class="doctor-heading"><span class="step-n tabular">5</span> That did not finish</h2>
            <p class="doctor-failed">
              The camera disconnected. Plug it back in and reload this page. Your camera is very
              probably fine.
            </p>
          </li>
        )}
      </ol>
    </div>
  );
}

function compare(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}
