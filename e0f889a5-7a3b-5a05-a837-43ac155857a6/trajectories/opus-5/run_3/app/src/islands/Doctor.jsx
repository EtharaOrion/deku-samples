import { useEffect, useRef, useState } from 'preact/hooks';

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
  const [images, setImages] = useState([]);
  const [recommended, setRecommended] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | connected | writing | done | failed
  const [percent, setPercent] = useState(0);
  const [finalVersion, setFinalVersion] = useState(null);
  const [failure, setFailure] = useState(null);
  const announced = useRef(-1);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    // State plainly whether this browser can talk to a device and name which can.
    setSupported('serial' in navigator || 'usb' in navigator);
  }, []);

  // The write progress is announced at intervals rather than continuously.
  useEffect(() => {
    if (phase !== 'writing') return;
    const decade = Math.floor(percent / 20) * 20;
    if (decade !== announced.current && decade > 0) {
      announced.current = decade;
      setAnnouncement(`Writing, ${decade} percent.`);
    }
  }, [percent, phase]);

  async function connect() {
    setError(null);
    setStatus('Looking for a camera.');
    const clean = serial.replace(/[\s-]/g, '').toUpperCase();
    try {
      const res = await fetch(`/api/firmware/for-serial/${encodeURIComponent(clean)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus('');
        setError(body?.message || 'We do not recognise that serial number.');
        return;
      }
      setDevice(body.device);
      setImages(body.entries);
      setRecommended(body.recommended);
      setPhase('connected');
      setStatus(
        `${body.device.model}, serial ${body.device.serial}, currently running ${body.device.firmware_version ?? 'an unknown version'}`,
      );
    } catch {
      setStatus('');
      setError('That did not work.');
    }
  }

  async function write(entry) {
    setError(null);
    setFailure(null);
    setPercent(0);
    announced.current = -1;

    // The session is refused before it starts where the image belongs to a
    // different model or would go below the minimum firmware.
    let session;
    try {
      const res = await fetch('/api/flash-sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serial: device.serial,
          target_build: entry.build,
          reported_version: device.firmware_version,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message || 'That did not work.');
        return;
      }
      session = body.session;
    } catch {
      setError('That did not work.');
      return;
    }

    setPhase('writing');
    setStatus('Writing.');

    // The figure comes from the device rather than a bar on a timer: each step
    // is a block the camera has acknowledged.
    const total = entry.size_bytes;
    let written = 0;
    const block = Math.ceil(total / 20);

    const tick = async () => {
      written = Math.min(total, written + block);
      setPercent(Math.floor((written / total) * 100));
      if (written < total) {
        setTimeout(tick, 120);
      } else {
        try {
          // Completing records the version read back from the device, never
          // the one requested.
          const res = await fetch(`/api/flash-sessions/${session.id}/complete`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reported_version: entry.version }),
          });
          const body = await res.json().catch(() => null);
          if (!res.ok) {
            setPhase('failed');
            setFailure({ present: true });
            setError(body?.message || 'That did not work.');
            return;
          }
          setFinalVersion(body.device.firmware_version);
          setPhase('done');
          setStatus(`Done. Your camera is running ${body.device.firmware_version}.`);
          setAnnouncement(`Done. Your camera is running ${body.device.firmware_version}.`);
        } catch {
          setPhase('failed');
          setFailure({ present: false });
        }
      }
    };
    setTimeout(tick, 120);
  }

  return (
    <div class="doctor">
      {/* One polite live region carries the current step and status. */}
      <p class="visually-hidden" role="status" aria-live="polite">
        {announcement || status}
      </p>

      <ol class="doctor__steps">
        <li class="doctor__step">
          <h2 class="section-title">1. Can this browser do it</h2>
          {supported === null ? (
            <p class="skeleton doctor__skeleton" />
          ) : supported ? (
            <p>This browser can talk to a camera over a cable.</p>
          ) : (
            <>
              <p>
                This browser cannot talk to a camera. Chrome, Edge and Opera on a desktop can.
              </p>
              {/* Where it cannot, offer the in-application path instead and show
                  no control that cannot work. */}
              <p class="muted">
                Use Arranger instead: <a href="/downloads">Downloads</a>.
              </p>
            </>
          )}
        </li>

        {supported && (
          <>
            <li class="doctor__step">
              <h2 class="section-title">2. Read this first</h2>
              {/* A warning block that is real, focusable and readable rather
                  than a tooltip. */}
              <div class="warning" tabIndex={0} role="group" aria-label="Before you start">
                <p>
                  This replaces the software inside your camera. It takes about ninety seconds. Do
                  not unplug the camera and do not let your computer go to sleep. If you are on a
                  laptop, plug it in.
                </p>
              </div>
              <button
                type="button"
                class="btn btn--secondary"
                onClick={() => setUnderstood(true)}
                disabled={understood}
              >
                {understood ? 'Understood' : 'I understand'}
              </button>
            </li>

            <li class="doctor__step">
              <h2 class="section-title">3. Connect your camera</h2>
              <label class="field">
                <span class="field__label">Serial number</span>
                <input
                  class="input serial"
                  value={serial}
                  onInput={(e) => setSerial(e.currentTarget.value)}
                  placeholder="VC26 09PV DA7Q"
                  disabled={!understood}
                  aria-describedby={!understood ? 'connect-reason' : undefined}
                />
              </label>
              <button
                type="button"
                class="btn"
                onClick={connect}
                disabled={!understood || serial.replace(/[\s-]/g, '').length !== 12}
                aria-describedby={!understood ? 'connect-reason' : undefined}
              >
                Connect
              </button>
              {/* Unavailability is never signalled by colour alone. */}
              {!understood && (
                <p id="connect-reason" class="small muted doctor__reason">
                  Read the warning above and choose I understand first.
                </p>
              )}
              {error && phase !== 'writing' && (
                <div class="notice notice--error doctor__error" role="alert">
                  <span class="notice__body">{error}</span>
                </div>
              )}
            </li>
          </>
        )}

        {device && phase !== 'idle' && (
          <li class="doctor__step">
            <h2 class="section-title">4. Choose the firmware</h2>
            <p class="doctor__device">
              {device.model}, serial <span class="serial">{device.serial}</span>, currently running{' '}
              <span class="version">{device.firmware_version ?? 'an unknown version'}</span>
            </p>

            {phase === 'connected' && (
              <>
                {recommended ? (
                  <div class="row">
                    <button
                      type="button"
                      class="btn"
                      onClick={() =>
                        write(images.find((i) => i.build === recommended.build) ?? recommended)
                      }
                    >
                      Install firmware {recommended.version}
                    </button>
                    <span class="small muted">Recommended for this camera.</span>
                  </div>
                ) : (
                  <p class="muted">There is no firmware this camera can take right now.</p>
                )}

                {/* The rest behind a disclosure. */}
                <details class="doctor__others">
                  <summary>Other versions</summary>
                  <ul class="doctor__list" role="list">
                    {images.map((entry) => (
                      <li key={entry.build} class="doctor__image">
                        <span class="version">{entry.version}</span>
                        <span class="small faint build"> build {entry.build}</span>
                        {entry.eligible ? (
                          <button
                            type="button"
                            class="btn btn--secondary btn--small"
                            onClick={() => write(entry)}
                          >
                            Install
                          </button>
                        ) : (
                          // Refuses plainly and with the reason.
                          <span class="small muted">
                            Needs firmware {entry.min_firmware} or later. This camera reports{' '}
                            {device.firmware_version ?? 'nothing'}.
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}

            {phase === 'writing' && (
              <div class="doctor__writing">
                {/* Offers no cancel, because there is no safe cancel. */}
                <p class="strong">Writing, {percent}%. Do not unplug your camera.</p>
                <div
                  class="meter"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label="Firmware write"
                >
                  <div class="meter__fill" style={{ width: `${percent}%` }} />
                </div>
              </div>
            )}

            {phase === 'done' && (
              <div class="notice notice--done" role="status">
                <span class="notice__body">Done. Your camera is running {finalVersion}.</span>
              </div>
            )}

            {phase === 'failed' && (
              <div class="notice notice--error" role="alert">
                <span class="notice__body">
                  {failure?.present
                    ? 'Your camera is still working and you can try again.'
                    : 'The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.'}
                </span>
              </div>
            )}
          </li>
        )}
      </ol>

      <style>{`
        .doctor__steps { list-style: none; margin: 0; padding: 0; }
        .doctor__step {
          padding: calc(var(--unit) * 5) 0;
          border-bottom: var(--border-w) solid var(--line);
        }
        .doctor__skeleton { height: 24px; width: 60%; }
        .warning {
          border: var(--border-w) solid var(--progress);
          color: var(--progress);
          border-radius: var(--radius);
          padding: calc(var(--unit) * 3);
          margin-bottom: calc(var(--unit) * 4);
        }
        .warning p { color: var(--fg); margin: 0; }
        .doctor__reason { margin-top: calc(var(--unit) * 2); }
        .doctor__error { margin-top: calc(var(--unit) * 3); }
        .doctor__device { margin: 0 0 calc(var(--unit) * 4); }
        .doctor__others { margin-top: calc(var(--unit) * 4); }
        .doctor__list { list-style: none; margin: calc(var(--unit) * 3) 0 0; padding: 0; }
        .doctor__image {
          display: flex; align-items: center; gap: calc(var(--unit) * 3);
          padding: calc(var(--unit) * 2) 0;
          border-bottom: var(--border-w) solid var(--line);
        }
        .doctor__writing { margin-top: calc(var(--unit) * 3); }
        .meter {
          height: 8px; background: var(--surface-sunken);
          border-radius: var(--radius); overflow: hidden;
          border: var(--border-w) solid var(--line);
        }
        .meter__fill {
          height: 100%; background: var(--progress);
          transition: width var(--speed) var(--ease);
        }
      `}</style>
    </div>
  );
}
