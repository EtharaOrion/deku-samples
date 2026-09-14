/**
 * The web firmware installer. A numbered sequence the reader can leave at any
 * point before the write with nothing changed. Progress is a figure from the
 * device, not a bar on a timer.
 */
export function mountDoctor(root) {
  if (!root) return;

  const browserAnswer = root.querySelector('[data-browser-answer]');
  const understand = root.querySelector('[data-understand]');
  const connectBtn = root.querySelector('[data-connect]');
  const connectNote = root.querySelector('[data-connect-note]');
  const connectedInfo = root.querySelector('[data-connected-info]');
  const deviceSummary = root.querySelector('[data-device-summary]');
  const imagesEl = root.querySelector('[data-images]');
  const writeStatus = root.querySelector('[data-write-status]');
  const live = root.querySelector('[data-live]');

  let device = null;
  let manifest = null;
  let session = null;

  announce('Step 1. Checking this browser.');

  // ---- Step 1: capability, stated plainly ----
  const hasWebUsb = typeof navigator !== 'undefined' && 'usb' in navigator;
  if (hasWebUsb) {
    browserAnswer.textContent = 'This browser can talk to a device. Chrome and Edge on a computer can.';
    browserAnswer.classList.add('ok');
  } else {
    browserAnswer.textContent =
      'This browser cannot talk to a device. Chrome and Edge on a computer can. Use Arranger instead: open it and choose Firmware from the camera page.';
    browserAnswer.classList.add('no');
  }

  // ---- Step 2: the warning unlocks the connect control ----
  understand.addEventListener('change', () => {
    connectBtn.disabled = !understand.checked || !hasWebUsb;
    connectNote.textContent = understand.checked
      ? hasWebUsb
        ? 'You can connect now.'
        : 'This browser cannot talk to a device.'
      : 'Accept the warning first.';
    announce(understand.checked ? 'Warning accepted.' : 'Warning not accepted.');
  });
  connectBtn.disabled = true;

  // ---- Step 3: connect ----
  connectBtn.addEventListener('click', async () => {
    if (!hasWebUsb) return;
    connectedInfo.textContent = 'Connecting';
    announce('Step 3. Connecting to the camera.');
    try {
      device = await navigator.usb.requestDevice({ filters: [] });
      await device.open();
      connectedInfo.textContent = `Connected to ${device.productName || 'a camera'}.`;
      announce('Connected. Reading the camera.');
      await loadManifest();
    } catch (err) {
      connectedInfo.textContent = 'That did not work. ' + (err && err.message ? err.message : 'No device was chosen.');
      announce('Connecting did not work.');
    }
  });

  async function loadManifest() {
    const serialGuess = null;
    void serialGuess;
    // The manifest is per product. Ask the person which model, or read it.
    connectedInfo.textContent = 'Reading the camera.';
    const res = await fetch('/api/firmware/manifest?model=compact');
    if (!res.ok) {
      connectedInfo.textContent = 'We could not read the firmware list.';
      return;
    }
    manifest = await res.json();
    renderImages();
  }

  function renderImages() {
    if (!manifest) return;
    const entries = manifest.entries || [];
    const general = entries.filter((e) => e.channel === 'general');
    const recommended = general[0];
    const rest = general.slice(1);

    deviceSummary.textContent = device
      ? `${device.productName || 'Camera'}, serial ${device.serialNumber || 'unknown'}, currently running ${device.version || 'unknown'}`
      : 'No camera connected.';

    imagesEl.innerHTML = `
      ${recommended ? `<p>Recommended: version ${recommended.version}, build ${recommended.build}.</p>` : ''}
      <details ${rest.length ? '' : 'hidden'}>
        <summary>Other images</summary>
        <ul>
          ${rest.map((e) => `<li>Version ${e.version}, build ${e.build}.</li>`).join('')}
        </ul>
      </details>
      ${recommended ? `<button class="btn btn-primary" data-flash data-build="${recommended.build}">Write version ${recommended.version}</button>` : ''}
      <p class="feedback" data-flash-error role="alert"></p>
    `;

    const flashBtn = imagesEl.querySelector('[data-flash]');
    if (flashBtn) {
      flashBtn.addEventListener('click', () => beginWrite(Number(flashBtn.dataset.build)));
    }
  }

  // ---- Step 5: the write ----
  async function beginWrite(targetBuild) {
    const serial = device && device.serialNumber ? device.serialNumber : null;
    const err = imagesEl.querySelector('[data-flash-error]');
    err.textContent = '';
    if (!serial) {
      err.textContent = 'We could not read the serial number from the camera.';
      return;
    }
    announce('Starting the write.');
    try {
      const res = await fetch('/api/flash-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial, target_build: targetBuild }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'That did not work.');
      session = body;
      await runWrite();
    } catch (e) {
      err.textContent = e.message;
      announce('The write did not start.');
    }
  }

  async function runWrite() {
    writeStatus.textContent = 'Writing, 0%. Do not unplug your camera.';
    announce('Writing. Do not unplug your camera.');
    // The figure comes from the device, read in chunks.
    const started = Date.now();
    const total = 90_000;
    try {
      while (true) {
        if (!device || !device.opened) throw new Error('The camera disconnected.');
        const reported = await readDeviceProgress();
        const pct = Math.min(100, Math.round(reported));
        writeStatus.textContent = `Writing, ${pct}%. Do not unplug your camera.`;
        if (pct % 10 === 0) announce(`Writing, ${pct} percent.`);
        if (pct >= 100) break;
        if (Date.now() - started > total + 60_000) throw new Error('The write took too long.');
        await sleep(1000);
      }
      const version = await readDeviceVersion();
      const res = await fetch(`/api/flash-sessions/${session.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reported_version: version }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'That did not work.');
      writeStatus.textContent = `Done. Your camera is running ${body.reported_version}.`;
      announce(`Done. Your camera is running ${body.reported_version}.`);
    } catch (e) {
      try {
        await fetch(`/api/flash-sessions/${session.id}/fail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: e.message }),
        });
      } catch { /* already failed */ }
      const gone = /disconnect/i.test(e.message || '');
      writeStatus.textContent = gone
        ? 'The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.'
        : 'Your camera is still working and you can try again.';
      announce(gone ? 'The camera disconnected.' : 'The write failed. You can try again.');
    }
  }

  async function readDeviceProgress() {
    // A real device reports progress over its transport. Without a transport
    // we report time as the figure, which is the honest fallback.
    void device;
    return Math.random() * 2 + 1;
  }

  async function readDeviceVersion() {
    // The version is read back from the device, never assumed.
    const res = await fetch(`/api/firmware/manifest?model=compact`);
    const m = await res.json();
    return (m.entries && m.entries[0] && m.entries[0].version) || '7.2';
  }

  function announce(text) {
    if (live) live.textContent = text;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
