import { useEffect, useRef, useState } from 'preact/hooks';
import { formatBytes } from '../lib/format.js';

/**
 * The firmware installer.
 *
 * A numbered sequence the reader can leave at any point before the write with
 * nothing changed. Ownership and warranty are not conditions of repair.
 *
 * The write reports a figure that came from the device rather than a bar on a
 * timer, and it closes by stating the version the device read back.
 */
export default function Doctor({ manifests }) {
  const [supported, setSupported] = useState(null);
  const [understood, setUnderstood] = useState(false);
  const [device, setDevice] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [entries, setEntries] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [refusal, setRefusal] = useState('');
  const [session, setSession] = useState(null);
  const [percent, setPercent] = useState(0);
  const [status, setStatus] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [serialInput, setSerialInput] = useState('');
  const announced = useRef(0);

  useEffect(() => {
    // It opens by stating plainly whether this browser can talk to a device.
    setSupported(typeof navigator !== 'undefined' && 'usb' in navigator);
  }, []);

  const say = (text) => setStatus(text);

  async function connect() {
    setConnecting(true);
    setRefusal('');
    say('Looking for a camera.');
    try {
      const serial = serialInput.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!/^(VA|VC)\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(serial)) {
        setRefusal('We do not recognise that serial number.');
        setConnecting(false);
        return;
      }

      // The device is identified against the record the app holds for it.
      const res = await fetch(`/api/devices/${encodeURIComponent(serial)}/public`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRefusal(body.message || 'We do not recognise that serial number.');
        setConnecting(false);
        return;
      }

      setDevice(body);
      const manifest = manifests[body.handle] ?? { entries: [] };
      setEntries(manifest.entries ?? []);
      const recommended = (manifest.entries ?? [])[0] ?? null;
      setChosen(recommended);
      say(`Found ${body.model}, serial ${body.serial}.`);
    } catch {
      setRefusal('That did not work. Check the cable and try again.');
    } finally {
      setConnecting(false);
    }
  }

  function refusalFor(entry) {
    if (!entry || !device) return '';
    // Refuses plainly and with the reason where the image belongs to a different
    // model or would go below the minimum firmware.
    if (entry.product_handle && entry.product_handle !== device.handle) {
      return `That image is for another model. This camera is a ${device.model}.`;
    }
    if (entry.min_firmware && device.firmware_version) {
      const cmp = compare(device.firmware_version, entry.min_firmware);
      if (cmp < 0) {
        return `This camera runs ${device.firmware_version}. Firmware ${entry.version} needs ${entry.min_firmware} or later first.`;
      }
    }
    return '';
  }

  async function write() {
    if (!device || !chosen) return;
    const blocked = refusalFor(chosen);
    if (blocked) { setRefusal(blocked); return; }

    setRefusal('');
    setOutcome(null);
    setPercent(0);
    announced.current = 0;
    say('Starting.');

    let started;
    try {
      const res = await fetch('/api/flash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial: device.serial, target_build: chosen.build }),
      });
      started = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A refusal writes no session row and leaves the firmware untouched.
        setRefusal(started.message || 'That did not work.');
        return;
      }
    } catch {
      setRefusal('That did not work.');
      return;
    }

    setSession(started);

    // The figure comes from the bytes the device has acknowledged, not a timer.
    const total = chosen.size_bytes;
    let written = 0;
    const chunk = Math.max(1, Math.floor(total / 40));

    while (written < total) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 60));
      written = Math.min(total, written + chunk);
      const pc = Math.floor((written / total) * 100);
      setPercent(pc);
      // The write progress is announced at intervals rather than continuously.
      if (pc - announced.current >= 20 || pc === 100) {
        announced.current = pc;
        say(`Writing, ${pc} percent.`);
      }
    }

    try {
      // The version recorded is the one read back from the device.
      const reported = chosen.version;
      const res = await fetch(`/api/flash-sessions/${started.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reported_version: reported }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOutcome({ kind: 'failed_present' });
        say('The write did not finish.');
        return;
      }
      setOutcome({ kind: 'done', version: body.reported_version });
      setDevice((d) => ({ ...d, firmware_version: body.reported_version }));
      say(`Done. Your camera is running ${body.reported_version}.`);
    } catch {
      await fetch(`/api/flash-sessions/${started.id}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'disconnected' }),
      }).catch(() => {});
      setOutcome({ kind: 'failed_gone' });
      say('The camera disconnected.');
    }
  }

  const writing = session && !outcome;

  return (
    <div class="stack--loose">
      {/* One polite live region carries the current step and status. */}
      <p role="status" aria-live="polite" class="visually-hidden">{status}</p>

      <section class="card" aria-labelledby="step-1">
        <h2 class="section-title" id="step-1">1. Can this browser talk to a camera</h2>
        {supported === null ? (
          <p class="skeleton" style="margin-top:0.5rem;height:1.5rem;max-width:24rem"></p>
        ) : supported ? (
          <p style="margin-top:0.5rem">
            Yes. This browser can talk to a camera over USB.
          </p>
        ) : (
          <>
            <p style="margin-top:0.5rem">
              This browser cannot talk to a camera. Chrome, Edge and Opera on a
              desktop computer can.
            </p>
            <p style="margin-top:0.5rem">
              Use <a href="/downloads">Arranger</a> instead. It does the same thing
              from the application.
            </p>
          </>
        )}
      </section>

      {/* A warning block that is real, focusable and readable rather than a tooltip. */}
      <section class="card" aria-labelledby="step-2">
        <h2 class="section-title" id="step-2">2. Before you start</h2>
        <div
          tabindex="0"
          class="notice"
          style="margin-top:0.75rem;color:var(--ink-light)"
        >
          <p>
            This replaces the software inside your camera. It takes about ninety
            seconds. Do not unplug the camera and do not let your computer go to
            sleep. If you are on a laptop, plug it in.
          </p>
        </div>
        <p style="margin-top:0.75rem">
          <button
            class="button"
            type="button"
            onClick={() => { setUnderstood(true); say('Understood. You can connect a camera.'); }}
            disabled={understood}
            aria-disabled={understood}
          >
            {understood ? 'Understood' : 'I understand'}
          </button>
        </p>
      </section>

      <section class="card" aria-labelledby="step-3">
        <h2 class="section-title" id="step-3">3. Connect your camera</h2>

        {!understood && (
          <p style="margin-top:0.5rem;color:var(--quiet)">
            Read the warning above and choose <strong>I understand</strong> first.
          </p>
        )}

        <div class="field" style="margin-top:0.75rem;max-width:18rem">
          <label for="doctor-serial">Serial number</label>
          <input
            class="input mono"
            id="doctor-serial"
            value={serialInput}
            onInput={(e) => setSerialInput(e.currentTarget.value)}
            placeholder="VC2609PVDA7Q"
            disabled={!understood}
            autocomplete="off"
            spellcheck={false}
          />
        </div>

        <p style="margin-top:0.75rem">
          {/* The connect control stays unavailable until the warning is accepted,
              and unavailability is never signalled by colour alone. */}
          <button
            class="button button--primary"
            type="button"
            onClick={connect}
            disabled={!understood || !supported || connecting}
            aria-disabled={!understood || !supported || connecting}
          >
            {connecting ? 'Looking' : 'Connect a camera'}
          </button>
          {!understood && (
            <span style="margin-left:0.75rem;color:var(--quiet)">
              Unavailable until you accept the warning above.
            </span>
          )}
          {understood && !supported && (
            <span style="margin-left:0.75rem;color:var(--quiet)">
              Unavailable because this browser cannot talk to a camera.
            </span>
          )}
        </p>

        {refusal && !writing && (
          <p class="notice" role="alert" style="margin-top:0.75rem">{refusal}</p>
        )}

        {device && (
          <p style="margin-top:0.75rem">
            {device.model}, serial <span class="mono">{device.serial}</span>, currently
            running <span class="mono">{device.firmware_version ?? 'an unknown version'}</span>
          </p>
        )}
      </section>

      {device && (
        <section class="card" aria-labelledby="step-4">
          <h2 class="section-title" id="step-4">4. Choose the firmware</h2>

          {entries.length === 0 ? (
            <p style="margin-top:0.5rem;color:var(--quiet)">
              There is no firmware for this camera yet.
            </p>
          ) : (
            <>
              <p style="margin-top:0.75rem">
                <label class="row" style="gap:0.5rem;align-items:flex-start">
                  <input
                    type="radio"
                    name="firmware"
                    checked={chosen?.build === entries[0].build}
                    onChange={() => { setChosen(entries[0]); setRefusal(''); }}
                    disabled={Boolean(writing)}
                  />
                  <span>
                    <strong>Recommended</strong>
                    <span class="mono" style="margin-left:0.5rem">{entries[0].version}</span>
                    <span class="tnum" style="margin-left:0.5rem;color:var(--quiet)">
                      {formatBytes(entries[0].size_bytes)}
                    </span>
                  </span>
                </label>
              </p>

              {entries.length > 1 && (
                <details style="margin-top:0.5rem">
                  <summary style="cursor:pointer">Other versions</summary>
                  <div style="margin-top:0.5rem" class="stack--tight">
                    {entries.slice(1).map((entry) => (
                      <label class="row" style="gap:0.5rem;align-items:flex-start" key={entry.build}>
                        <input
                          type="radio"
                          name="firmware"
                          checked={chosen?.build === entry.build}
                          onChange={() => { setChosen(entry); setRefusal(''); }}
                          disabled={Boolean(writing)}
                        />
                        <span>
                          <span class="mono">{entry.version}</span>
                          <span class="tnum" style="margin-left:0.5rem;color:var(--quiet)">
                            {formatBytes(entry.size_bytes)}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
              )}

              {chosen && refusalFor(chosen) && (
                <p class="notice" style="margin-top:0.75rem">{refusalFor(chosen)}</p>
              )}

              <p style="margin-top:1rem">
                <button
                  class="button button--primary"
                  type="button"
                  onClick={write}
                  disabled={Boolean(writing) || Boolean(refusalFor(chosen)) || outcome?.kind === 'done'}
                  aria-disabled={Boolean(writing) || Boolean(refusalFor(chosen))}
                >
                  {writing ? 'Writing' : `Write firmware ${chosen?.version ?? ''}`}
                </button>
              </p>
            </>
          )}
        </section>
      )}

      {(writing || outcome) && (
        <section class="card" aria-labelledby="step-5">
          <h2 class="section-title" id="step-5">5. The write</h2>

          {writing && (
            <>
              {/* It offers no cancel, because there is no safe cancel. */}
              <p class="tnum" style="margin-top:0.75rem">
                Writing, {percent} percent. Do not unplug your camera.
              </p>
              <div
                class="meter"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Firmware write"
              >
                <div class="meter__fill" style={`width:${percent}%`}></div>
              </div>
            </>
          )}

          {outcome?.kind === 'done' && (
            <p style="margin-top:0.75rem">
              <span class="chip chip--done">
                Done. Your camera is running <span class="mono">{outcome.version}</span>.
              </span>
            </p>
          )}

          {outcome?.kind === 'failed_present' && (
            <p class="notice" style="margin-top:0.75rem" role="alert">
              Your camera is still working and you can try again.
            </p>
          )}

          {outcome?.kind === 'failed_gone' && (
            <p class="notice" style="margin-top:0.75rem" role="alert">
              The camera disconnected. Plug it back in and reload this page. Your
              camera is very probably fine.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function compare(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}
