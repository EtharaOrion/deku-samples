import { useEffect, useRef, useState } from 'preact/hooks';
import { openDeviceLink, transportsAvailable } from '../lib/devicelink.js';

const STEPS = ['Check this browser', 'Read the warning', 'Connect the camera', 'Choose the image', 'Write'];

export default function Installer() {
  const [support, setSupport] = useState({ serial: false, checked: false });
  const [accepted, setAccepted] = useState(false);
  const [manual, setManual] = useState('');
  const [device, setDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [recommended, setRecommended] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [problem, setProblem] = useState('');
  const [phase, setPhase] = useState('idle');
  const [percent, setPercent] = useState(0);
  const [finalVersion, setFinalVersion] = useState('');
  const [status, setStatus] = useState('Step 1 of 5. Checking whether this browser can talk to a camera.');
  const linkRef = useRef(null);
  const lastAnnounced = useRef(0);

  useEffect(() => {
    const t = transportsAvailable();
    setSupport({ serial: t.serial, checked: true });
    setStatus(
      t.serial
        ? 'Step 1 of 5. This browser can talk to a camera over a cable.'
        : 'Step 1 of 5. This browser cannot open a cable connection. You can still use the recovery channel.',
    );
  }, []);

  const announce = (text) => setStatus(text);

  const connect = async (mode) => {
    setProblem('');
    setPhase('connecting');
    announce('Step 3 of 5. Looking for a camera.');
    try {
      const link = await openDeviceLink({ mode, serial: manual.replace(/[\s-]/g, '').toUpperCase() });
      linkRef.current = link;
      const identity = await link.identify();
      const res = await fetch(`/api/firmware/lookup/${encodeURIComponent(identity.serial)}`, {
        credentials: 'same-origin',
      });
      const body = await res.json();
      if (!res.ok) {
        setPhase('idle');
        setProblem(body.message || 'That did not work.');
        announce(body.message || 'That did not work.');
        return;
      }
      setDevice({ ...body.device, reported_version: identity.version || body.device.firmware_version });
      setImages(body.images);
      setRecommended(body.recommended);
      setChosen(body.recommended ? body.recommended.build : null);
      setPhase('identified');
      announce(
        `Step 4 of 5. ${body.device.model}, serial ${body.device.serial}, currently running ${
          identity.version || body.device.firmware_version || 'no version'
        }.`,
      );
    } catch (err) {
      setPhase('idle');
      setProblem(err.message || 'We could not reach the camera.');
      announce(err.message || 'We could not reach the camera.');
    }
  };

  const write = async () => {
    if (!device || !chosen) return;
    setProblem('');
    setPhase('starting');
    announce('Step 5 of 5. Starting the write.');
    let session = null;
    try {
      const res = await fetch('/api/flash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          serial: device.serial,
          target_build: chosen,
          reported_version: device.reported_version || undefined,
        }),
      });
      session = await res.json();
      if (!res.ok) {
        setPhase('identified');
        setProblem(session.message || 'That did not work.');
        announce(session.message || 'That did not work.');
        return;
      }
    } catch {
      setPhase('identified');
      setProblem('That did not work. The write did not start.');
      return;
    }

    setPhase('writing');
    setPercent(0);
    try {
      const link = linkRef.current;
      const readBack = await link.write(chosen, (p) => {
        // The figure comes from the device, not from a timer.
        setPercent(p);
        if (p - lastAnnounced.current >= 20) {
          lastAnnounced.current = p;
          announce(`Writing, ${p} percent. Do not unplug your camera.`);
        }
      });
      const res = await fetch(`/api/flash-sessions/${session.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reported_version: readBack.version }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPhase('failed');
        setProblem(body.message || 'That did not work.');
        return;
      }
      setFinalVersion(body.reported_version);
      setPhase('done');
      announce(`Done. Your camera is running ${body.reported_version}.`);
    } catch (err) {
      const present = Boolean(err && err.devicePresent);
      await fetch(`/api/flash-sessions/${session.id}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ reason: (err && err.message) || 'write failed' }),
      }).catch(() => {});
      setPhase(present ? 'failed_present' : 'failed_gone');
      announce('The write did not finish.');
    }
  };

  return (
    <div class="installer">
      <p class="visually-hidden" role="status" aria-live="polite" data-test="live-region">
        {status}
      </p>

      <ol class="steps">
        {STEPS.map((s, i) => (
          <li key={s} class="mono">
            {i + 1}. <span class="step-label">{s}</span>
          </li>
        ))}
      </ol>

      <section class="card step" aria-labelledby="s1">
        <h2 id="s1">1. Can this browser talk to your camera</h2>
        {!support.checked ? (
          <p class="skeleton" style="height:3em" aria-hidden="true" />
        ) : support.serial ? (
          <p data-test="support-line">
            This browser can open a cable connection to a camera. Plug the camera in with the cable that came with it.
          </p>
        ) : (
          <>
            <p data-test="support-line">
              This browser cannot open a cable connection. Chrome, Edge and Opera on a desktop computer can.
            </p>
            <p style="margin-top:calc(var(--unit) * 2)">
              You can install from inside Arranger instead: <a href="/downloads">download Arranger</a>. If Arranger
              cannot see your camera, use the recovery channel below and enter the serial engraved on the underside.
            </p>
          </>
        )}
      </section>

      <section class="card step" aria-labelledby="s2">
        <h2 id="s2">2. Read this before you go further</h2>
        <div class="warning" tabindex="0" role="group" aria-labelledby="warning-title">
          <p id="warning-title" style="font-weight:700">Before you write</p>
          <p>
            This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and
            do not let your computer go to sleep. If you are on a laptop, plug it in.
          </p>
        </div>
        <button
          type="button"
          class="btn"
          style="margin-top:calc(var(--unit) * 3)"
          onClick={() => {
            setAccepted(true);
            announce('Step 3 of 5. Connect the camera.');
          }}
          disabled={accepted}
          data-test="understand"
        >
          {accepted ? 'Understood' : 'I understand'}
        </button>
      </section>

      <section class="card step" aria-labelledby="s3">
        <h2 id="s3">3. Connect the camera</h2>
        {!accepted ? (
          <p class="hint" data-test="connect-blocked">
            Unavailable until you have read the warning above and chosen I understand.
          </p>
        ) : null}

        {support.serial ? (
          <button
            type="button"
            class="btn"
            onClick={() => connect('serial')}
            disabled={!accepted || phase === 'connecting'}
            aria-describedby={!accepted ? 'connect-why' : undefined}
          >
            {phase === 'connecting' ? 'Looking for a camera' : 'Connect over the cable'}
          </button>
        ) : null}

        <div class="recovery">
          <label for="serial-in">Recovery channel: the serial engraved on the underside</label>
          <input
            id="serial-in"
            class="mono"
            type="text"
            value={manual}
            maxLength={14}
            placeholder="VC26 09PV DA7Q"
            onInput={(e) => setManual(e.currentTarget.value)}
            disabled={!accepted}
            data-test="serial-input"
          />
          <button
            type="button"
            class="btn secondary"
            onClick={() => connect('recovery')}
            disabled={!accepted || manual.replace(/[\s-]/g, '').length !== 12 || phase === 'connecting'}
            data-test="connect-recovery"
          >
            Connect over the recovery channel
          </button>
          <p class="hint" id="connect-why">
            The recovery channel reads the camera through its service port. Use it when the cable connection is not
            available in this browser.
          </p>
        </div>
        {problem && phase !== 'writing' ? (
          <p class="notice wrong" role="alert" data-test="installer-problem">
            {problem}
          </p>
        ) : null}
      </section>

      {device ? (
        <section class="card step" aria-labelledby="s4">
          <h2 id="s4">4. Choose the image</h2>
          <p data-test="device-line">
            <strong>{device.model}</strong>, serial <span class="mono">{device.serial}</span>, currently running{' '}
            <span class="mono">{device.reported_version || 'no version'}</span>
          </p>

          {recommended ? (
            <label class="image recommended">
              <input
                type="radio"
                name="image"
                checked={chosen === recommended.build}
                onChange={() => setChosen(recommended.build)}
              />
              <span>
                <strong>
                  Recommended: <span class="mono">{recommended.version}</span>
                </strong>
                <span class="hint"> build {recommended.build}</span>
              </span>
            </label>
          ) : (
            <p class="notice wrong">
              There is no image this camera can accept from here. Write to us before going further.
            </p>
          )}

          <details style="margin-top:calc(var(--unit) * 3)">
            <summary>Other images</summary>
            <div class="stack" style="margin-top:calc(var(--unit) * 2)">
              {images
                .filter((i) => !recommended || i.build !== recommended.build)
                .map((i) => (
                  <label class="image" key={i.build}>
                    <input type="radio" name="image" checked={chosen === i.build} onChange={() => setChosen(i.build)} />
                    <span>
                      <span class="mono">{i.version}</span>{' '}
                      <span class="hint">
                        build {i.build}
                        {i.min_firmware ? `, needs ${i.min_firmware} or later` : ''}
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          </details>

          <button
            type="button"
            class="btn"
            style="margin-top:calc(var(--unit) * 4)"
            onClick={write}
            disabled={!chosen || phase === 'writing' || phase === 'starting' || phase === 'done'}
            data-test="write"
          >
            Write this image to the camera
          </button>
        </section>
      ) : null}

      {phase === 'writing' ? (
        <section class="card step" aria-labelledby="s5">
          <h2 id="s5">5. Writing</h2>
          <p class="tnum" data-test="write-progress">
            Writing, {percent} percent. Do not unplug your camera.
          </p>
          <div class="bar" aria-hidden="true">
            <span style={`width:${percent}%`} />
          </div>
          <p class="hint">There is no safe way to cancel a write, so there is no cancel here.</p>
        </section>
      ) : null}

      {phase === 'done' ? (
        <section class="card step done-card" aria-labelledby="s-done">
          <h2 id="s-done">Done</h2>
          <p data-test="write-done">
            Done. Your camera is running <span class="mono">{finalVersion}</span>.
          </p>
          <p class="hint">You can unplug the camera now.</p>
        </section>
      ) : null}

      {phase === 'failed' || phase === 'failed_present' ? (
        <section class="card step" aria-labelledby="s-failed">
          <h2 id="s-failed">That did not finish</h2>
          <p data-test="write-failed">Your camera is still working and you can try again.</p>
        </section>
      ) : null}

      {phase === 'failed_gone' ? (
        <section class="card step" aria-labelledby="s-gone">
          <h2 id="s-gone">The camera disconnected</h2>
          <p data-test="write-failed">
            The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.
          </p>
        </section>
      ) : null}

      <style>{`
        .installer { display: grid; gap: calc(var(--unit) * 6); max-width: 78ch; }
        .steps { display: flex; flex-wrap: wrap; gap: calc(var(--unit) * 4); list-style: none; margin: 0; padding: 0; font-size: 14px; line-height: 21px; color: var(--ink-quiet); }
        .step h2 { font-size: 18px; line-height: 26px; margin-bottom: calc(var(--unit) * 3); }
        .warning { border: 1px solid var(--rule); border-left-width: 3px; border-left-color: var(--state-wrong); border-radius: var(--radius); padding: calc(var(--unit) * 3); background: var(--ground-sunken); }
        .recovery { display: grid; gap: calc(var(--unit) * 2); margin-top: calc(var(--unit) * 4); max-width: 34ch; }
        .image { display: flex; gap: calc(var(--unit) * 2); align-items: center; border: 1px solid var(--rule); border-radius: var(--radius); padding: calc(var(--unit) * 2) calc(var(--unit) * 3); cursor: pointer; }
        .image input { width: auto; min-height: 0; }
        .image.recommended { border-color: var(--ink); }
        .bar { height: 8px; border: 1px solid var(--rule); border-radius: var(--radius); overflow: hidden; margin: calc(var(--unit) * 2) 0; }
        .bar span { display: block; height: 100%; background: var(--state-progress); }
        .done-card { border-left: 3px solid var(--state-done); }
      `}</style>
    </div>
  );
}
