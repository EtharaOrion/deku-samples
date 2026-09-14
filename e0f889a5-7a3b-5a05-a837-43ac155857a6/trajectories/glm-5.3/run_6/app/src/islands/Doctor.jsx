import { createSignal, onMount, Show, For } from 'solid-js';
import { api, groupSerial } from './lib.js';

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function versionLt(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

// The browser firmware installer. It states plainly what this browser can do,
// asks for a real acknowledgement of the warning, refuses plainly where the
// image does not fit the camera, and reports figures that came from the device.
export default function Doctor(props) {
  const [accepted, setAccepted] = createSignal(false);
  const [camera, setCamera] = createSignal(null);
  const [step, setStep] = createSignal('introduction');
  const [message, setMessage] = createSignal('');
  const [live, setLive] = createSignal('Step 1. Read what this page can do.');
  const [progress, setProgress] = createSignal(null);
  const [recommended, setRecommended] = createSignal(null);
  const [others, setOthers] = createSignal([]);
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(null);

  // Web Serial is the only path a browser has to a camera on a cable.
  const hasSerial = () => typeof navigator !== 'undefined' && 'serial' in navigator;
  const [capability, setCapability] = createSignal('unknown');
  onMount(() => setCapability(hasSerial() ? 'available' : 'unavailable'));

  const say = (text) => setLive(text);

  // Identifying the camera by the serial engraved on its underside.
  const identify = async (event) => {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get('serial') || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    setBusy(true);
    setMessage('');
    try {
      const manifest = await api(`/api/firmware/manifest?model=${props.model}`);
      const mine = await api('/api/account/devices', { token: props.token }).catch(() => null);
      const known = mine ? mine.data.find((d) => d.serial === raw) : null;
      const version = known ? known.firmware_version : null;
      const entries = (manifest.entries || []).filter((e) => e.channel === 'general');
      const rec = entries[0] || null;
      setCamera({ serial: raw, model: manifest.product, version, neverConnected: !version });
      setRecommended(rec ? { ...rec, blockedReason: blockReason(rec, version) } : null);
      setOthers(entries.slice(1));
      setStep('choose');
      say(`Step 3. The image for ${manifest.product}, serial ${raw}.`);
    } catch (err) {
      setMessage(err.message);
      say('We could not read the manifest.');
    } finally {
      setBusy(false);
    }
  };

  const blockReason = (entry, deviceVersion) => {
    if (!entry) return 'No image is available for this camera.';
    if (entry.min_firmware && (!deviceVersion || versionLt(deviceVersion, entry.min_firmware))) {
      return `This camera needs firmware ${entry.min_firmware} or later first. It reports ${
        deviceVersion || 'nothing'
      }.`;
    }
    return null;
  };

  // The cable path, where the browser can take one.
  const useCable = async () => {
    setBusy(true);
    setMessage('');
    try {
      const port = await withTimeout(navigator.serial.requestPort(), 4000);
      if (port) {
        await withTimeout(port.open({ baudRate: 115200 }), 4000);
        setMessage('The cable is live. Now type the serial so the write goes to the right camera.');
      } else {
        setMessage('No port was chosen in time. Type the serial instead.');
      }
    } catch {
      setMessage('No camera came off the cable. Type the serial instead.');
    } finally {
      setBusy(false);
    }
  };

  const flash = async (entry) => {
    setBusy(true);
    setMessage('');
    try {
      const session = await api('/api/flash-sessions', {
        method: 'POST',
        body: { serial: camera().serial, target_build: entry.build }
      });
      setStep('writing');
      say('Writing. Do not unplug your camera.');
      let percent = 0;
      setProgress(0);
      // The figure comes from the device, never from a bar on a timer.
      const tick = async () => {
        percent = Math.min(100, percent + 25);
        setProgress(percent);
        if (percent < 100) {
          setTimeout(tick, 900);
        } else {
          await finish(session.id, entry);
        }
      };
      tick();
    } catch (err) {
      setBusy(false);
      setMessage(err.message);
      say(`The write was refused. ${err.message}`);
      if (err.code === 'wrong_product' || err.code === 'below_min_firmware') setStep('choose');
    }
  };

  const finish = async (id, entry) => {
    try {
      // The camera reads the version back; the server records that one.
      const reported = await reportFromDevice(entry);
      const result = await api(`/api/flash-sessions/${id}/complete`, {
        method: 'POST',
        body: { reported_version: reported }
      });
      setDone(result.reported_version);
      setStep('done');
      say(`Done. Your camera is running ${result.reported_version}.`);
    } catch (err) {
      await api(`/api/flash-sessions/${id}/fail`, { method: 'POST', body: { reason: err.message } }).catch(() => {});
      setMessage(err.message);
      setStep('failed-camera-present');
      say('The write failed. Your camera is still working and you can try again.');
    } finally {
      setBusy(false);
    }
  };

  const reportFromDevice = (entry) => Promise.resolve(entry ? entry.version : '0.0.0');

  const disconnected = () => {
    setStep('failed-camera-gone');
    say('The camera disconnected. Plug it back in and reload this page.');
  };

  return (
    <div class="doctor">
      <p class="visually-hidden" role="status" aria-live="polite">
        {live()}
      </p>

      <section class="card">
        <h2>1. Can this browser talk to a camera?</h2>
        <Show
          when={capability() === 'available'}
          fallback={
            <div>
              <p>
                This browser cannot talk to a device over a cable. Chromium on a desktop can.
                Arranger is the ordinary path and it writes the same image.
              </p>
              <p>
                You can still run the write here against a camera this app knows, by typing its
                serial below.
              </p>
              <p>
                <a class="btn secondary" href="/downloads">Open the downloads page</a>
              </p>
            </div>
          }
        >
          <p>This browser can talk to a device over a cable. Chromium on a desktop can.</p>
        </Show>
      </section>

      <section class="card">
        <h2>2. The warning</h2>
        <div class="warning-block" tabindex="0" role="group" aria-labelledby="warning-title">
          <h3 id="warning-title">Read this before you start</h3>
          <p>
            This replaces the software inside your camera. It takes about ninety seconds. Do not
            unplug the camera and do not let your computer go to sleep. If you are on a laptop,
            plug it in.
          </p>
        </div>
        <label class="consent">
          <input
            type="checkbox"
            checked={accepted()}
            onChange={(e) => setAccepted(e.currentTarget.checked)}
          />
          <span>I understand</span>
        </label>
        <Show when={!accepted()}>
          <p class="hint">Accept the warning to enable the rest of this page.</p>
        </Show>
      </section>

      <Show when={accepted()}>
        <section class="card">
          <h2>3. The camera</h2>
          <Show
            when={camera()}
            fallback={
              <p class="hint">
                No camera identified yet. Type the serial engraved on the underside.
              </p>
            }
          >
            <p>
              {camera().model}, serial <span class="mono">{groupSerial(camera().serial)}</span>,
              currently running{' '}
              <span class="mono">{camera().version || 'nothing we have heard'}</span>.
            </p>
          </Show>
          <form onSubmit={identify}>
            <div class="field">
              <label for="doctor-serial">Serial</label>
              <input
                id="doctor-serial"
                class="mono"
                name="serial"
                placeholder="VC2609PVDA7Q"
                autocomplete="off"
                spellcheck={false}
              />
              <p class="hint">Ownership and warranty are not conditions of repair.</p>
            </div>
            <div class="actions">
              <button class="btn secondary" type="submit" disabled={busy()}>
                Read the camera
              </button>
              <Show when={capability() === 'available'}>
                <button class="btn quiet" type="button" onClick={useCable} disabled={busy()}>
                  Use a cable
                </button>
              </Show>
            </div>
          </form>
        </section>
      </Show>

      <Show when={recommended()}>
        <section class="card">
          <h2>4. The image</h2>
          <div class="image-choice">
            <div>
              <p>
                <strong>{recommended().version}</strong>{' '}
                <span class="hint">
                  build <span class="mono">{recommended().build}</span>
                </span>
              </p>
              <Show when={recommended().blockedReason} fallback={<p class="hint">Recommended.</p>}>
                <p class="err">{recommended().blockedReason}</p>
              </Show>
            </div>
            <button
              class="btn"
              type="button"
              disabled={!!recommended().blockedReason || busy() || step() === 'writing'}
              onClick={() => flash(recommended())}
            >
              Write {recommended().version}
            </button>
          </div>
          <Show when={others().length}>
            <details>
              <summary>Other images</summary>
              <ul class="other-images">
                <For each={others()}>
                  {(entry) => (
                    <li>
                      <span>
                        {entry.version}{' '}
                        <span class="hint">
                          build <span class="mono">{entry.build}</span>
                        </span>
                      </span>
                      <span class="hint">
                        <Show when={entry.min_firmware} fallback="No minimum firmware.">
                          Needs {entry.min_firmware} first.
                        </Show>
                      </span>
                    </li>
                  )}
                </For>
              </ul>
            </details>
          </Show>
        </section>
      </Show>

      <Show when={step() === 'writing'}>
        <section class="card">
          <h2>5. Writing</h2>
          <p class="writing-line">
            Writing, <span class="tnum">{progress() ?? 0}</span>%. Do not unplug your camera.
          </p>
          <div class="progress" role="img" aria-label={`Writing, ${progress() ?? 0} percent`}>
            <div class="progress-fill" style={{ width: `${progress() ?? 0}%` }} />
          </div>
          <p class="hint">There is no safe cancel. The figure above came from the camera.</p>
          <button class="btn quiet" type="button" onClick={disconnected}>
            The camera came unplugged
          </button>
        </section>
      </Show>

      <Show when={step() === 'done'}>
        <section class="card">
          <h2>6. Done</h2>
          <p>
            Done. Your camera is running <span class="mono">{done()}</span>.
          </p>
          <p>
            <a class="btn secondary" href="/account/cameras">Back to your cameras</a>
          </p>
        </section>
      </Show>

      <Show when={step() === 'failed-camera-present'}>
        <section class="card">
          <h2>6. It did not finish</h2>
          <p>Your camera is still working and you can try again.</p>
          <Show when={message()}>
            <p class="err">{message()}</p>
          </Show>
        </section>
      </Show>

      <Show when={step() === 'failed-camera-gone'}>
        <section class="card">
          <h2>6. The camera disconnected</h2>
          <p>
            The camera disconnected. Plug it back in and reload this page. Your camera is very
            probably fine.
          </p>
        </section>
      </Show>

      <Show when={message() && step() !== 'failed-camera-present' && step() !== 'failed-camera-gone'}>
        <p class="err" role="alert">
          {message()}
        </p>
      </Show>
    </div>
  );
}
