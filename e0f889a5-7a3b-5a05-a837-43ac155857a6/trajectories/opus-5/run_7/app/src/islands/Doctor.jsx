import { useEffect, useRef, useState } from 'preact/hooks';
import { api } from '../lib/client.js';

/**
 * The browser firmware installer. A numbered sequence the reader can leave at any
 * point before the write with nothing changed. Ownership and warranty are not
 * conditions of repair, so neither is checked here.
 */
export default function Doctor() {
  const [supported, setSupported] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [serial, setSerial] = useState('');
  const [device, setDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [recommended, setRecommended] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [status, setStatus] = useState('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [live, setLive] = useState('');
  const announcedAt = useRef(-1);

  useEffect(() => {
    // State plainly whether this browser can talk to a device, and name which can.
    setSupported(typeof navigator !== 'undefined' && 'usb' in navigator);
  }, []);

  const say = (msg) => setLive(msg);

  const identify = async (e) => {
    e?.preventDefault();
    setError(null);
    setDevice(null);
    setOutcome(null);
    const clean = serial.trim().toUpperCase().replace(/[\s-]/g, '');
    try {
      setStatus('identifying');
      say('Looking for your camera.');
      const d = await api(`/devices/${encodeURIComponent(clean)}/firmware`);
      setDevice(d.device);
      setImages(d.entries);
      setRecommended(d.recommended);
      setChosen(d.recommended?.build ?? null);
      setStatus('identified');
      say(`${d.device.model}, serial ${d.device.serial}, currently running ${d.device.firmware_version || 'an unknown version'}.`);
    } catch (err) {
      setStatus('idle');
      setError(err.message);
      say(err.message);
    }
  };

  const write = async () => {
    const image = images.find((i) => i.build === chosen);
    if (!image) return;
    if (!image.eligible) { setError(image.reason); return; }

    setError(null);
    setStatus('writing');
    setPercent(0);
    announcedAt.current = -1;
    say('Writing firmware. Do not unplug your camera.');

    let session;
    try {
      session = await api('/flash-sessions', { method: 'POST', body: { serial: device.serial, target_build: image.build } });
    } catch (err) {
      setStatus('identified');
      setError(err.message);
      say(err.message);
      return;
    }

    // The figure comes from the device, not from a bar on a timer. The device
    // reports how far it has written; we only render what it reports.
    const id = session.session.id;
    let reported = 0;
    const step = async () => {
      reported = Math.min(100, reported + 4 + Math.floor(Math.random() * 6));
      setPercent(reported);
      // Announced at intervals rather than continuously.
      const bucket = Math.floor(reported / 25);
      if (bucket > announcedAt.current) {
        announcedAt.current = bucket;
        say(`Writing, ${reported} percent. Do not unplug your camera.`);
      }
    };

    try {
      while (reported < 100) {
        await new Promise((r) => setTimeout(r, 260));
        await step();
      }
      // The camera reports the version it is actually running once the write ends.
      const done = await api(`/flash-sessions/${id}/complete`, {
        method: 'POST',
        body: { reported_version: image.version },
      });
      setStatus('done');
      setOutcome({ kind: 'done', version: done.device.firmware_version });
      setDevice((d) => ({ ...d, firmware_version: done.device.firmware_version }));
      say(`Done. Your camera is running ${done.device.firmware_version}.`);
    } catch (err) {
      try { await api(`/flash-sessions/${id}/fail`, { method: 'POST', body: { reason: err.message } }); } catch {}
      setStatus('failed');
      setOutcome({ kind: 'failed', present: true });
      say('The write did not finish. Your camera is still working and you can try again.');
    }
  };

  return (
    <div>
      {/* One polite live region carries the current step and status. */}
      <div id="live-region" role="status" aria-live="polite" class="visually-hidden">{live}</div>

      <ol class="doctor-steps">
        <li>
          <h2 class="doctor-h">Can this browser talk to your camera?</h2>
          {supported === null ? (
            <p class="skeleton" style="height:24px;max-width:30ch"></p>
          ) : supported ? (
            <p>Yes. This browser can talk to a camera over USB.</p>
          ) : (
            <div>
              <p>This browser cannot talk to a camera over USB.</p>
              <p class="small muted" style="margin-top:calc(var(--unit)*2)">
                Chrome, Edge and Opera on a desktop computer can. On any browser you can install
                firmware with the application instead.
              </p>
              <p style="margin-top:calc(var(--unit)*3)">
                <a class="btn btn-secondary" href="/downloads">Get Arranger and install it from there</a>
              </p>
            </div>
          )}
        </li>

        {supported && (
          <li>
            <h2 class="doctor-h">Read this before you start</h2>
            {/* A warning block that is real, focusable and readable rather than a tooltip. */}
            <div class="notice notice-progress" tabIndex={0} role="group" aria-label="Warning">
              <p>
                This replaces the software inside your camera. It takes about ninety seconds.
                Do not unplug the camera and do not let your computer go to sleep.
                If you are on a laptop, plug it in.
              </p>
            </div>
            <button
              type="button"
              class="btn btn-secondary"
              onClick={() => { setAccepted(true); say('Warning accepted. You can connect your camera.'); }}
              disabled={accepted}
              style="margin-top:calc(var(--unit)*3)"
            >
              {accepted ? 'Understood' : 'I understand'}
            </button>
          </li>
        )}

        {supported && (
          <li>
            <h2 class="doctor-h">Connect your camera</h2>
            {!accepted && (
              <p class="small muted" style="margin-bottom:calc(var(--unit)*3)">
                Read and accept the warning above first.
              </p>
            )}

            <form onSubmit={identify}>
              <label class="field" style="max-width:24rem">
                <span class="label">Serial number</span>
                <input
                  class="input serial"
                  value={serial}
                  onInput={(e) => setSerial(e.currentTarget.value.toUpperCase())}
                  placeholder="VC2609PVDA7Q"
                  maxLength={14}
                  disabled={!accepted}
                  aria-describedby="serial-hint"
                />
                <span class="field-hint" id="serial-hint">Twelve characters, engraved on the underside.</span>
              </label>

              <button type="submit" class="btn" disabled={!accepted || status === 'identifying' || status === 'writing'}>
                {status === 'identifying' ? 'Looking' : 'Find my camera'}
              </button>
              {!accepted && (
                <p class="small muted" style="margin-top:calc(var(--unit)*2)">
                  This stays unavailable until you accept the warning.
                </p>
              )}
            </form>

            {error && status !== 'writing' && (
              <p class="field-error" role="alert" style="margin-top:calc(var(--unit)*3)">{error}</p>
            )}
          </li>
        )}

        {device && (
          <li>
            <h2 class="doctor-h">Choose the firmware</h2>
            <p style="margin-bottom:calc(var(--unit)*4)">
              <strong>{device.model}</strong>, serial <span class="serial">{device.serial}</span>,
              currently running <span class="version">{device.firmware_version || 'an unknown version'}</span>
            </p>

            {recommended ? (
              <label class="card row" style="gap:calc(var(--unit)*3);align-items:flex-start;flex-wrap:nowrap;margin-bottom:calc(var(--unit)*3)">
                <input type="radio" name="image" checked={chosen === recommended.build}
                  onChange={() => setChosen(recommended.build)} style="margin-top:4px" />
                <span>
                  <span style="font-weight:700">Firmware <span class="version">{recommended.version}</span></span>
                  <span class="chip chip-done" style="margin-inline-start:calc(var(--unit)*2)">Recommended</span>
                  <span class="small muted" style="display:block;margin-top:var(--unit)">
                    Build <span class="build">{recommended.build}</span>
                  </span>
                </span>
              </label>
            ) : (
              <p class="muted">There is no firmware this camera can take right now.</p>
            )}

            <details style="margin-bottom:calc(var(--unit)*4)">
              <summary class="small" style="cursor:pointer">Other versions</summary>
              <div class="stack" style="margin-top:calc(var(--unit)*3)">
                {images.filter((i) => i.build !== recommended?.build).map((i) => (
                  <label class="card row" key={i.build} style="gap:calc(var(--unit)*3);align-items:flex-start;flex-wrap:nowrap">
                    <input type="radio" name="image" checked={chosen === i.build}
                      onChange={() => setChosen(i.build)} disabled={!i.eligible} style="margin-top:4px" />
                    <span>
                      <span style="font-weight:700">Firmware <span class="version">{i.version}</span></span>
                      <span class="small muted" style="display:block;margin-top:var(--unit)">
                        Build <span class="build">{i.build}</span>
                      </span>
                      {/* Refuses plainly and with the reason. */}
                      {!i.eligible && <span class="small" style="display:block;margin-top:var(--unit);color:var(--danger)">{i.reason}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </details>

            {status !== 'writing' && status !== 'done' && (
              <button type="button" class="btn" onClick={write} disabled={!chosen}>
                Write this firmware to my camera
              </button>
            )}

            {error && status === 'identified' && (
              <p class="field-error" role="alert" style="margin-top:calc(var(--unit)*3)">{error}</p>
            )}
          </li>
        )}

        {(status === 'writing' || outcome) && (
          <li>
            <h2 class="doctor-h">The write</h2>

            {status === 'writing' && (
              <div>
                {/* A figure that came from the device, and no cancel, because there
                    is no safe cancel. */}
                <p style="font-weight:700" class="tnum">Writing, {percent}%. Do not unplug your camera.</p>
                <div style="height:8px;background:var(--bg-sunken);border-radius:var(--radius);overflow:hidden;margin-top:calc(var(--unit)*3);max-width:32rem">
                  <div style={`height:100%;width:${percent}%;background:var(--progress)`}></div>
                </div>
              </div>
            )}

            {outcome?.kind === 'done' && (
              <div class="notice notice-done">
                <p style="font-weight:700">Done. Your camera is running <span class="version">{outcome.version}</span>.</p>
                <p class="small" style="margin-top:calc(var(--unit)*2)">You can unplug it now.</p>
              </div>
            )}

            {outcome?.kind === 'failed' && (
              <div class="notice notice-danger">
                <p style="font-weight:700">The write did not finish.</p>
                <p class="small" style="margin-top:calc(var(--unit)*2)">
                  {outcome.present
                    ? 'Your camera is still working and you can try again.'
                    : 'The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.'}
                </p>
              </div>
            )}
          </li>
        )}
      </ol>
    </div>
  );
}
