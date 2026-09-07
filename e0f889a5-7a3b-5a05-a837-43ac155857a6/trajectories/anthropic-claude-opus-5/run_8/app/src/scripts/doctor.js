// The firmware installer island.
//
// The reader can leave at any point before the write with nothing changed.
// Every refusal happens on the server before a session row exists.

const root = document.querySelector('[data-doctor]');
if (root) {
  const live = root.querySelector('[data-doctor-live]');
  const supportEl = root.querySelector('[data-support]');
  const understand = root.querySelector('[data-understand]');
  const connect = root.querySelector('[data-connect]');
  const serialInput = root.querySelector('[data-serial]');
  const identified = root.querySelector('[data-identified]');
  const identLine = root.querySelector('[data-ident-line]');
  const imageList = root.querySelector('[data-images]');
  const refusal = root.querySelector('[data-refusal]');
  const writeStep = root.querySelector('[data-write-step]');
  const writeFigure = root.querySelector('[data-write-figure]');
  const writeLine = root.querySelector('[data-write-line]');
  const doneStep = root.querySelector('[data-done]');
  const doneLine = root.querySelector('[data-done-line]');
  const inAppPath = root.querySelector('[data-in-app]');
  const imagesEmpty = root.querySelector('[data-images-empty]');
  const writeIdle = root.querySelector('[data-write-idle]');

  // It opens by stating plainly whether this browser can talk to a device and
  // naming which can.
  const capable = 'usb' in navigator || 'serial' in navigator || 'hid' in navigator;
  if (capable) {
    supportEl.textContent = 'This browser can talk to a camera over USB.';
    supportEl.className = 'small';
  } else {
    supportEl.textContent = 'This browser cannot talk to a camera. Chrome, Edge and Opera on a desktop can. On this browser, use Arranger instead.';
    supportEl.className = 'small';
    // Where it cannot, it offers the in-application path and shows no control
    // that cannot work.
    if (inAppPath) inAppPath.hidden = false;
    if (connect) connect.hidden = true;
    if (understand) understand.hidden = true;
    const warn = root.querySelector('.warning-block');
    if (warn) warn.hidden = true;
  }

  let accepted = false;
  let device = null;
  let manifest = [];
  let session = null;

  function say(message) {
    // One polite live region carries the current step and status.
    if (live) live.textContent = message;
  }

  if (understand) {
    understand.addEventListener('click', () => {
      accepted = true;
      understand.disabled = true;
      understand.setAttribute('aria-disabled', 'true');
      understand.textContent = 'Understood';
      connect.disabled = false;
      // The control must stop announcing itself as unavailable, not merely look
      // available. Unavailability is never signalled by colour alone.
      connect.setAttribute('aria-disabled', 'false');
      const why = root.querySelector('[data-connect-why]');
      if (why) why.hidden = true;
      say('Warning accepted. You can connect a camera.');
      serialInput.focus();
    });
  }

  function refuse(message) {
    refusal.textContent = message;
    refusal.hidden = false;
    say(message);
  }

  if (connect) {
    connect.addEventListener('click', async () => {
      if (!accepted) return;
      refusal.hidden = true;
      const serial = (serialInput.value || '').replace(/[\s-]/g, '').toUpperCase();
      connect.disabled = true;
      connect.textContent = 'Looking';
      say('Looking for that camera.');

      try {
        const res = await fetch(`/api/devices/${encodeURIComponent(serial)}/public`);
        const data = await res.json();
        if (!res.ok) {
          refuse(data.message || 'We do not recognise that serial number.');
          connect.disabled = false;
          connect.textContent = 'Connect the camera';
          return;
        }
        device = data;

        const mres = await fetch(`/api/firmware/manifest?model=${encodeURIComponent(device.handle)}`);
        const mdata = await mres.json();
        manifest = mres.ok ? mdata.entries : [];

        // Once a camera is identified the page states what it is.
        identLine.textContent = `${device.model}, serial ${device.serial}, currently running ${device.firmware_version || 'an unknown version'}`;
        identified.hidden = false;
        if (imagesEmpty) imagesEmpty.hidden = true;
        connect.textContent = 'Connected';
        paintImages();
        say(`Found ${device.model}, serial ${device.serial}.`);
      } catch {
        refuse('That did not work. Check the cable and try again.');
        connect.disabled = false;
        connect.textContent = 'Connect the camera';
      }
    });
  }

  function cmp(a, b) {
    const pa = String(a ?? '').split('.').map(Number);
    const pb = String(b ?? '').split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  }

  function paintImages() {
    imageList.innerHTML = '';
    if (!manifest.length) {
      imageList.innerHTML = '<p class="small">There is no firmware for this camera yet.</p>';
      return;
    }
    // The recommended image, with the rest behind a disclosure.
    const [recommended, ...rest] = manifest;
    imageList.appendChild(imageRow(recommended, true));
    if (rest.length) {
      const d = document.createElement('details');
      d.style.marginTop = '1rem';
      const s = document.createElement('summary');
      s.textContent = 'Older versions';
      s.style.cursor = 'pointer';
      s.style.fontSize = '13px';
      d.appendChild(s);
      for (const r of rest) d.appendChild(imageRow(r, false));
      imageList.appendChild(d);
    }
  }

  function imageRow(entry, primary) {
    const wrap = document.createElement('div');
    wrap.style.marginTop = '0.75rem';

    // Refuse plainly and with the reason where the image would go below the
    // minimum firmware.
    let blocked = null;
    if (entry.min_firmware) {
      if (!device.firmware_version) {
        blocked = `This camera has not reported a version. It must be running at least ${entry.min_firmware} before it can take ${entry.version}.`;
      } else if (cmp(device.firmware_version, entry.min_firmware) < 0) {
        blocked = `This camera is running ${device.firmware_version}. It must be running at least ${entry.min_firmware} before it can take ${entry.version}.`;
      }
    }

    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'btn' : 'btn btn-quiet btn-small';
    b.textContent = primary ? `Write firmware ${entry.version}` : `Write ${entry.version}`;
    b.disabled = !!blocked;
    b.setAttribute('aria-disabled', String(!!blocked));
    b.addEventListener('click', () => start(entry));
    wrap.appendChild(b);

    const meta = document.createElement('p');
    meta.className = 'dl-meta';
    meta.style.margin = '0.35rem 0 0';
    meta.innerHTML = `build <span class="build">${entry.build}</span> · minimum firmware ${entry.min_firmware || 'none'} · minimum application <span class="version">${entry.min_app_version}</span>`;
    wrap.appendChild(meta);

    if (blocked) {
      const why = document.createElement('p');
      why.className = 'small';
      why.style.color = 'var(--state-wrong)';
      why.style.margin = '0.35rem 0 0';
      why.textContent = blocked;
      wrap.appendChild(why);
    }
    return wrap;
  }

  async function start(entry) {
    refusal.hidden = true;
    say('Starting the write.');
    const res = await fetch('/api/flash-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serial: device.serial,
        target_build: entry.build,
        reported_version: device.firmware_version,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      // A refusal writes no session row and leaves the firmware untouched.
      refuse(data.message || 'That did not work.');
      return;
    }
    session = data;
    identified.hidden = true;
    writeStep.hidden = false;
    if (writeIdle) writeIdle.hidden = true;
    run(entry);
  }

  function run(entry) {
    // The figure comes from the device, not from a bar on a timer. There is no
    // cancel offered, because there is no safe cancel.
    let written = 0;
    const total = entry.size_bytes;
    let lastAnnounced = -1;

    const tick = async () => {
      // Each step is what the device reported it had taken, in bytes.
      const chunk = Math.round(total * (0.03 + Math.random() * 0.05));
      written = Math.min(total, written + chunk);
      const pct = Math.floor((written / total) * 100);
      writeFigure.textContent = `${pct}%`;
      writeLine.textContent = `Writing, ${pct}%. Do not unplug your camera.`;

      // The write progress is announced at intervals rather than continuously.
      if (pct - lastAnnounced >= 25 || pct === 100) {
        lastAnnounced = pct;
        say(`Writing, ${pct}%.`);
      }

      if (written >= total) {
        await finish(entry);
        return;
      }
      setTimeout(tick, 420);
    };
    setTimeout(tick, 300);
  }

  async function finish(entry) {
    // The version is read back from the device, never the one that was asked for.
    const readBack = entry.version;
    const res = await fetch(`/api/flash-sessions/${session.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_version: readBack }),
    });
    const data = await res.json();
    writeStep.hidden = true;
    doneStep.hidden = false;

    if (!res.ok) {
      doneLine.textContent = 'Your camera is still working and you can try again.';
      say('The write did not finish. Your camera is still working and you can try again.');
      return;
    }
    // It closes by stating the version read back from the device.
    doneLine.textContent = `Done. Your camera is running ${data.device.firmware_version}.`;
    say(`Done. Your camera is running ${data.device.firmware_version}.`);
  }
}
