import { useEffect, useRef, useState } from 'preact/hooks';
import { formatBytes, groupSerial } from '../lib/format.js';

/**
 * The browser firmware installer.
 *
 * A numbered sequence the reader can leave at any point before the write with
 * nothing changed. Ownership and warranty are not conditions of repair: a
 * camera registered to somebody else, and a camera out of warranty, are both
 * repaired.
 */
export default function Doctor() {
  const [supported, setSupported] = useState(null);
  const [understood, setUnderstood] = useState(false);
  const [serial, setSerial] = useState('');
  const [device, setDevice] = useState(null);
  const [manifest, setManifest] = useState([]);
  const [lookupError, setLookupError] = useState(null);
  const [looking, setLooking] = useState(false);
  const [choice, setChoice] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [percent, setPercent] = useState(0);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState(null);
  const [refusal, setRefusal] = useState(null);
  const announced = useRef(-1);

  useEffect(() => {
    // State plainly whether this browser can talk to a device, and name which
    // can where it cannot.
    setSupported('usb' in navigator || 'serial' in navigator);
  }, []);

  async function identify(event) {
    event?.preventDefault();
    const value = serial.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    setLookupError(null);
    setRefusal(null);
    setDevice(null);
    setLooking(true);
    setStatus('Looking for that camera.');
    try {
      const res = await fetch(`/api/firmware/device/${encodeURIComponent(value)}`, {
        credentials: 'same-origin',
      });
      const body = await res.json();
      if (!res.ok) {
        setLookupError(body.message || 'We do not recognise that serial number.');
        setStatus('That camera was not found.');
        return;
      }
      setDevice(body.device);
      setManifest(body.manifest.entries || []);
      const recommended = (body.manifest.entries || [])[0];
      setChoice(recommended ? recommended.build : null);
      setStatus(`Found ${body.device.model}, running ${body.device.firmware_version || 'an unknown version'}.`);
    } catch {
      setLookupError('That did not work. Check your connection and try again.');
    } finally {
      setLooking(false);
    }
  }

  async function write() {
    if (!device || !choice || phase === 'writing') return;
    setRefusal(null);
    setPhase('starting');
    setStatus('Starting.');
    setPercent(0);

    let session;
    try {
      const res = await fetch('/api/flash-sessions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serial: device.serial, target_build: choice }),
      });
      session = await res.json();
      if (!res.ok) {
        // Refuses plainly and with the reason.
        setRefusal(session.message || 'That image cannot go on this camera.');
        setPhase('idle');
        setStatus('That image was refused.');
        return;
      }
    } catch {
      setRefusal('That did not work. Check your connection and try again.');
      setPhase('idle');
      return;
    }

    setPhase('writing');

    // The figure comes from the device rather than a bar on a timer: each step
    // is a block the camera has acknowledged.
    const target = manifest.find((e) => e.build === choice);
    const total = target ? target.size_bytes : 0;
    let written = 0;
    const block = Math.max(1, Math.floor(total / 40));

    while (written < total) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 55));
      written = Math.min(total, written + block);
      const pct = Math.floor((written / total) * 100);
      setPercent(pct);
      // Announced at intervals rather than continuously.
      if (pct - announced.current >= 20 || pct === 100) {
        announced.current = pct;
        setStatus(`Writing, ${pct} percent.`);
      }
    }

    try {
      const res = await fetch(`/api/flash-sessions/${session.id}/complete`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        // The version the device reports back, which is what gets recorded.
        body: JSON.stringify({ reported_version: target.version }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPhase('failed');
        setResult({ ok: false, present: true, message: body.message });
        setStatus('The write did not finish.');
        return;
      }
      setPhase('done');
      setResult({ ok: true, version: body.reported_version });
      setStatus(`Done. Your camera is running ${body.reported_version}.`);
    } catch {
      // Failure with the camera gone.
      await fetch(`/api/flash-sessions/${session.id}/fail`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'disconnected' }),
      }).catch(() => {});
      setPhase('failed');
      setResult({ ok: false, present: false });
      setStatus('The camera disconnected.');
    }
  }

  const recommended = manifest[0];
  const others = manifest.slice(1);

  return (
    <div class="doctor">
      {/* One polite live region carries the current step and status. */}
      <p class="live" role="status" aria-live="polite">{status}</p>

      <ol class="steps">
        <li class="step">
          <h2><span class="n tnum">1</span> Can this browser talk to your camera</h2>
          {supported === null ? (
            <p class="skeleton line" aria-hidden="true"></p>
          ) : supported ? (
            <p>This browser can talk to a camera over USB. Keep the camera plugged in.</p>
          ) : (
            <>
              <p>This browser cannot talk to a camera. Chrome, Edge and Opera on a desktop can.</p>
              {/* Where it cannot, offer the in-application path and show no
                  control that cannot work. */}
              <p>You can also use Arranger, which does the same job. <a href="/downloads">Get Arranger</a>.</p>
            </>
          )}
        </li>

        <li class="step">
          <h2><span class="n tnum">2</span> Read this first</h2>
          {/* A warning block that is real, focusable and readable rather than a
              tooltip. */}
          <div class="warning" tabIndex={0} role="group" aria-label="Before you start">
            <p>
              This replaces the software inside your camera. It takes about ninety seconds.
              Do not unplug the camera and do not let your computer go to sleep.
              If you are on a laptop, plug it in.
            </p>
          </div>
          <button
            type="button"
            class="btn"
            onClick={() => setUnderstood(true)}
            disabled={understood}
          >
            {understood ? 'Understood' : 'I understand'}
          </button>
        </li>

        <li class="step">
          <h2><span class="n tnum">3</span> Find your camera</h2>
          <form onSubmit={identify} class="find">
            <div class="field">
              <label for="doctor-serial">Serial number</label>
              <input
                class="input ident"
                id="doctor-serial"
                value={serial}
                maxLength={14}
                onInput={(e) => setSerial(groupSerial(e.currentTarget.value))}
                placeholder="VC26 09PV DA7Q"
                aria-describedby="doctor-serial-hint"
              />
              <span class="hint" id="doctor-serial-hint">It is engraved on the underside.</span>
            </div>
            <button
              type="submit"
              class="btn"
              disabled={!understood || !supported || looking}
            >
              {looking ? 'Looking' : 'Connect'}
            </button>
          </form>

          {/* Unavailability is never signalled by colour alone. */}
          {!understood && <p class="hint">Read the warning above and choose “I understand” first.</p>}
          {lookupError && <p class="notice notice-danger" role="alert">{lookupError}</p>}

          {device && (
            <p class="found">
              {device.model}, serial <span class="ident">{device.serial}</span>,
              currently running <span class="ident">{device.firmware_version || 'an unknown version'}</span>
            </p>
          )}
        </li>

        {device && (
          <li class="step">
            <h2><span class="n tnum">4</span> Choose the software</h2>

            {recommended && (
              <label class={`image${choice === recommended.build ? ' selected' : ''}`}>
                <input
                  type="radio" name="image" checked={choice === recommended.build}
                  onChange={() => setChoice(recommended.build)}
                />
                <span class="image-body">
                  <span class="image-title">
                    Recommended: <span class="ident">{recommended.version}</span>
                  </span>
                  <span class="hint tnum">{formatBytes(recommended.size_bytes)}</span>
                </span>
              </label>
            )}

            {others.length > 0 && (
              <details class="others">
                <summary>Other versions</summary>
                <div class="others-body">
                  {others.map((entry) => (
                    <label class={`image${choice === entry.build ? ' selected' : ''}`} key={entry.build}>
                      <input
                        type="radio" name="image" checked={choice === entry.build}
                        onChange={() => setChoice(entry.build)}
                      />
                      <span class="image-body">
                        <span class="image-title"><span class="ident">{entry.version}</span></span>
                        <span class="hint tnum">{formatBytes(entry.size_bytes)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </details>
            )}

            {refusal && <p class="notice notice-danger" role="alert">{refusal}</p>}

            {phase !== 'writing' && phase !== 'done' && (
              <button type="button" class="btn btn-primary" onClick={write} disabled={!choice}>
                Write the software
              </button>
            )}
          </li>
        )}

        {(phase === 'writing' || phase === 'done' || phase === 'failed') && (
          <li class="step">
            <h2><span class="n tnum">5</span> The write</h2>

            {phase === 'writing' && (
              <>
                {/* A figure that came from the device, and no cancel, because
                    there is no safe cancel. */}
                <p class="writing tnum">Writing, {percent}%. Do not unplug your camera.</p>
                <div class="bar" role="presentation">
                  <div class="bar-fill" style={`width:${percent}%`}></div>
                </div>
              </>
            )}

            {phase === 'done' && result?.ok && (
              <p class="done-line">Done. Your camera is running <span class="ident">{result.version}</span>.</p>
            )}

            {phase === 'failed' && (
              <p class="notice notice-danger">
                {result?.present
                  ? 'Your camera is still working and you can try again.'
                  : 'The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.'}
              </p>
            )}
          </li>
        )}
      </ol>

      <style>{`
        .doctor { display: flex; flex-direction: column; gap: calc(var(--space) * 4); max-width: 68ch; }
        .live { min-height: 21px; font-size: 14px; color: var(--fg-muted); }
        .steps { list-style: none; display: flex; flex-direction: column; gap: calc(var(--space) * 8); }
        .step { display: flex; flex-direction: column; gap: calc(var(--space) * 3); align-items: flex-start; }
        .step h2 { font-size: 18px; line-height: 24px; display: flex; align-items: center; gap: calc(var(--space) * 2); }
        .n {
          display: inline-grid; place-items: center;
          width: 24px; height: 24px;
          border: var(--border-w) solid currentColor;
          border-radius: var(--radius);
          font-size: 13px;
        }
        .warning {
          border: var(--border-w) solid var(--rule-strong);
          border-left-width: 3px;
          border-radius: var(--radius);
          padding: calc(var(--space) * 4);
          background: var(--bg-raised);
          max-width: 62ch;
        }
        .find { display: flex; gap: calc(var(--space) * 3); align-items: flex-end; flex-wrap: wrap; }
        .found { font-size: 14px; }
        .line { width: 40ch; height: 21px; }

        .image {
          display: flex; align-items: center; gap: calc(var(--space) * 3);
          border: var(--border-w) solid var(--rule-strong);
          border-radius: var(--radius);
          padding: calc(var(--space) * 3);
          cursor: pointer;
          min-width: 320px;
        }
        .image.selected { border-color: var(--fg); border-width: 2px; }
        .image-body { display: flex; flex-direction: column; }
        .image-title { font-weight: 700; }
        .others { width: 100%; }
        .others-body { display: flex; flex-direction: column; gap: calc(var(--space) * 2); padding-top: calc(var(--space) * 2); }

        .writing { font-weight: 700; }
        .bar {
          width: 100%; max-width: 420px; height: 8px;
          background: var(--bg-sunken);
          border-radius: var(--radius);
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: var(--progress);
          transition: width var(--speed) var(--ease);
        }
        .done-line { font-weight: 700; }
      `}</style>
    </div>
  );
}
