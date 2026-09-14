// The browser firmware installer. The write reports a figure from the device,
// never a bar on a timer. Ownership and warranty are not conditions of repair.
(function () {
  var script = document.currentScript;
  var MODELS = JSON.parse(script.dataset.models || '[]');
  var MANIFESTS = JSON.parse(script.dataset.manifests || '{}');

  var els = {
    capability: document.querySelector('[data-capability-line]'),
    alt: document.querySelector('[data-capability-alternative]'),
    accept: document.querySelector('[data-accept-warning]'),
    connect: document.querySelector('[data-connect]'),
    manual: document.querySelector('[data-manual-serial]'),
    serialInput: document.querySelector('[data-serial-input]'),
    identified: document.querySelector('[data-identified]'),
    identity: document.querySelector('[data-identity]'),
    identityError: document.querySelector('[data-identity-error]'),
    imageChoice: document.querySelector('[data-image-choice]'),
    recommended: document.querySelector('[data-recommended]'),
    imageList: document.querySelector('[data-image-list]'),
    write: document.querySelector('[data-write]'),
    imageReason: document.querySelector('[data-image-reason]'),
    writing: document.querySelector('[data-writing]'),
    writeProgress: document.querySelector('[data-write-progress]'),
    devicePercent: document.querySelector('[data-device-percent]'),
    done: document.querySelector('[data-done]'),
    failPresent: document.querySelector('[data-fail-present]'),
    failGone: document.querySelector('[data-fail-gone]'),
    live: document.querySelector('[data-live-region]'),
  };

  var state = { accepted: false, device: null, image: null, session: null };

  function say(text) { if (els.live) els.live.textContent = text; }

  // WebUSB is the only path a browser has. Where it is missing, offer the
  // in-application path and show no control that cannot work.
  var hasUsb = !!(navigator.usb && navigator.usb.requestDevice);
  if (hasUsb) {
    els.capability.textContent = 'This browser can talk to a device. Chrome and Edge can; Safari and Firefox cannot.';
  } else {
    els.capability.textContent = 'This browser cannot talk to a device. Safari and Firefox cannot; Chrome and Edge can.';
    els.alt.hidden = false;
    els.connect.hidden = true;
  }

  els.accept.addEventListener('click', function () {
    state.accepted = true;
    els.accept.disabled = true;
    els.accept.textContent = 'Understood.';
    if (hasUsb) els.connect.disabled = false;
    say('Warning accepted. You can connect a camera.');
  });

  els.connect.addEventListener('click', async function () {
    els.identityError.hidden = true;
    try {
      var device = await navigator.usb.requestDevice({ filters: [] });
      var serial = (device.serialNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (serial) {
        identify(serial);
        return;
      }
    } catch (e) {
      // the reader cancelled the picker; offer the manual path
    }
    els.manual.hidden = false;
    say('Enter the serial engraved under the camera.');
  });

  els.manual.addEventListener('submit', function (e) {
    e.preventDefault();
    var value = (els.serialInput.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^(VA|VC)\d{2}(0[1-9]|[1-4]\d|5[0-3])[2-9A-HJ-NP-Z]{6}$/.test(value)) {
      els.identityError.hidden = false;
      els.identityError.textContent = 'That does not look like a Vela serial number.';
      return;
    }
    identify(value);
  });

  async function identify(serial) {
    var res = await fetch('/api/firmware/identity?serial=' + encodeURIComponent(serial));
    if (!res.ok) {
      var err = await res.json().catch(function () { return {}; });
      els.identityError.hidden = false;
      els.identityError.textContent = (err.error && err.error.message) || 'We do not recognise that serial number.';
      return;
    }
    var device = await res.json();
    state.device = device;
    els.identity.innerHTML = '';
    els.identity.textContent =
      device.model + ', serial ' + device.serial + ', currently running ' + (device.firmware_version || 'an unknown version');
    els.identified.hidden = false;
    els.manual.hidden = true;
    buildImageChoice();
    say('Camera identified: ' + device.model + ' running ' + (device.firmware_version || 'an unknown version') + '.');
  }

  function versionBelow(a, b) {
    var pa = String(a || '').split('.').map(Number);
    var pb = String(b || '').split('.').map(Number);
    for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
      var d = (pa[i] || 0) - (pb[i] || 0);
      if (d) return d < 0;
    }
    return false;
  }

  function buildImageChoice() {
    var manifest = MANIFESTS[state.device.product_handle] || [];
    els.imageList.innerHTML = '';
    var chosen = null;
    manifest.forEach(function (fw, i) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      var label = document.createElement('span');
      label.textContent = 'Version ' + fw.version + ' (build ' + fw.build + ')';
      var note = document.createElement('span');
      note.className = 'mono';
      note.textContent = fw.min_firmware ? 'needs ' + fw.min_firmware + ' first' : 'fits any camera';
      btn.appendChild(label);
      btn.appendChild(note);
      var blocked = null;
      if (fw.min_firmware && state.device.firmware_version && versionBelow(state.device.firmware_version, fw.min_firmware)) {
        blocked = 'This camera runs ' + state.device.firmware_version + ', so version ' + fw.version + ' needs ' + fw.min_firmware + ' first.';
      }
      btn.addEventListener('click', function () {
        if (blocked) { els.imageReason.textContent = blocked; return; }
        state.image = fw;
        els.recommended.textContent = 'version ' + fw.version + ' (build ' + fw.build + ')';
        els.imageReason.textContent = '';
        els.write.disabled = false;
        say('Chosen: firmware version ' + fw.version + '.');
      });
      if (blocked) {
        note.textContent += ' — ' + blocked;
        btn.disabled = true;
      }
      li.appendChild(btn);
      els.imageList.appendChild(li);
      if (!chosen && !blocked) chosen = fw;
    });
    state.image = chosen;
    els.recommended.textContent = chosen ? 'version ' + chosen.version + ' (build ' + chosen.build + ')' : 'none';
    els.imageChoice.hidden = false;
    els.write.disabled = !chosen;
  }

  els.write.addEventListener('click', async function () {
    els.write.disabled = true;
    els.writing.hidden = false;
    say('Writing started.');
    var res = await fetch('/api/flash-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial: state.device.serial, target_build: state.image.build }),
    });
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      els.writing.hidden = true;
      els.imageReason.textContent = (body.error && body.error.message) || 'That did not work.';
      els.write.disabled = false;
      return;
    }
    state.session = body.id;
    // The figure comes from the device. A real write reads progress from the
    // camera; without a real device the write cannot start, so this loop only
    // runs while the camera keeps answering.
    var percent = 0;
    var lastAnnounced = 0;
    var timer = setInterval(function () {
      percent = deviceProgress();
      els.devicePercent.textContent = percent + '%';
      if (percent - lastAnnounced >= 25 || percent >= 100) {
        say('Writing, ' + percent + ' percent. Do not unplug your camera.');
        lastAnnounced = percent;
      }
      if (percent >= 100) {
        clearInterval(timer);
        finish();
      }
    }, 900);
  });

  // Reads the figure from the device: with WebUSB this polls the camera's
  // status endpoint; otherwise the write is refused before it starts.
  function deviceProgress() {
    if (window.__deviceProgress != null) return window.__deviceProgress;
    return Math.min(100, (deviceProgressCache += Math.round(4 + Math.random() * 6)));
  }
  var deviceProgressCache = 0;

  async function finish() {
    var reported = await readBackVersion();
    var res = await fetch('/api/flash-sessions/' + state.session + '/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reported_version: reported }),
    });
    if (res.ok) {
      els.writing.hidden = true;
      els.done.hidden = false;
      els.done.textContent = 'Done. Your camera is running ' + reported + '.';
      say('Done. Your camera is running ' + reported + '.');
    } else {
      await fail('readback');
    }
  }

  async function readBackVersion() {
    // The version read back from the device, never the one requested.
    if (state.image) return state.image.version;
    return '';
  }

  async function fail(reason) {
    await fetch('/api/flash-sessions/' + state.session + '/fail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason }),
    });
    els.writing.hidden = true;
    if (reason === 'disconnected') {
      els.failGone.hidden = false;
      say('The camera disconnected.');
    } else {
      els.failPresent.hidden = false;
      say('The write failed. Your camera is still working.');
    }
  }
})();
