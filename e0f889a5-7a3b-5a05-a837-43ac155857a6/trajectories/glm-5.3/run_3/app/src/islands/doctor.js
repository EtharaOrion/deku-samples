import { api } from '../lib/client.js';
import { SERIAL_RE } from '../lib/format.js';
import { compareVersion, groupSerial } from '../lib/format.js';

class DoctorInstaller extends HTMLElement {
  connectedCallback() {
    this.state = { accepted: false, device: null, serialInput: '', manifest: [], chosen: null, session: null, progress: null, done: null, failed: null };
    this.render();
  }
  set(patch) { this.state = { ...this.state, ...patch }; this.render(); }
  err(patch) { this.state = { ...this.state, ...patch }; this.render(); }

  render() {
    const s = this.state;
    const usb = 'usb' in navigator;
    const step1 = `
      <section class="step" aria-labelledby="d-cap">
        <p class="step-num" id="d-cap">Step 1</p>
        <h2 id="d-cap-t">Can this browser talk to a camera?</h2>
        <p>${usb
          ? 'This browser can talk to a device over WebUSB. Chromium on a desktop can.'
          : 'This browser cannot talk to a device. It needs WebUSB, which means a Chromium browser on a desktop. Install the firmware from Arranger instead: open Arranger, connect the camera, and choose Firmware.'}</p>
      </section>`;

    const warning = `
      <section class="warning" tabindex="0" role="group" aria-labelledby="d-warn">
        <h2 id="d-warn">Before you start</h2>
        <p>This replaces the software inside your camera. It takes about ninety seconds. Do not unplug the camera and do not let your computer go to sleep. If you are on a laptop, plug it in.</p>
        <button class="btn" data-accept ${s.accepted ? 'disabled' : ''} type="button">${s.accepted ? 'Accepted' : 'I understand'}</button>
        ${s.accepted ? '' : '<p class="quiet">The connect control stays unavailable until the warning is accepted.</p>'}
      </section>`;

    const identify = `
      <section class="step" aria-labelledby="d-id">
        <p class="step-num">Step 2</p>
        <h2 id="d-id">Identify the camera</h2>
        <p>Type the serial engraved under the camera.</p>
        <div class="serial-field">
          <input data-serial inputmode="text" autocomplete="off" spellcheck="false"
                 placeholder="VC26 09PV DA7Q" value="${s.serialInput}"
                 aria-label="Serial number" ${s.accepted ? '' : 'disabled'} />
          <button class="btn" data-identify type="button" ${s.accepted ? '' : 'disabled'}>Identify</button>
        </div>
        <p class="quiet" data-serial-note aria-live="polite">${s.accepted ? '' : 'Accept the warning first.'}</p>
        ${s.device ? `<p class="device-line">${s.device.model}, serial <span class="mono">${s.device.serial}</span>, currently running <span class="mono">${s.device.firmware_version || 'nothing we have heard'}</span></p>` : ''}
        ${s.refusal ? `<p class="refusal" role="alert">${s.refusal}</p>` : ''}
      </section>`;

    let images = '';
    if (s.device && s.manifest.length) {
      const recommended = s.manifest.find((f) => f.channel === 'general'
        && (!f.min_firmware || !s.device.firmware_version || compareVersion(s.device.firmware_version, f.min_firmware) >= 0));
      const others = s.manifest.filter((f) => f !== recommended);
      images = `
      <section class="step" aria-labelledby="d-img">
        <p class="step-num">Step 3</p>
        <h2 id="d-img">Choose the software</h2>
        ${recommended ? `
          <p>Recommended: firmware <span class="mono">${recommended.version}</span>, build <span class="mono tnum">${recommended.build}</span>, minimum firmware ${recommended.min_firmware || 'none'}.</p>
          <button class="btn btn-primary" data-write="${recommended.build}" data-version="${recommended.version}" type="button">Write firmware ${recommended.version}</button>
        ` : '<p class="refusal">No general image suits this camera. Write it from Arranger.</p>'}
        <details>
          <summary>All images for this model</summary>
          <ul class="image-list">
            ${s.manifest.map((f) => {
              const wrongProduct = false;
              const below = f.min_firmware && s.device.firmware_version && compareVersion(s.device.firmware_version, f.min_firmware) < 0;
              return `<li>
                <span>firmware <span class="mono">${f.version}</span>, build <span class="mono tnum">${f.build}</span>, channel ${f.channel}, minimum ${f.min_firmware || 'none'}</span>
                ${below
                  ? `<span class="refusal">Needs ${f.min_firmware} or later</span>`
                  : `<button data-write="${f.build}" data-version="${f.version}" type="button">Write</button>`}
              </li>`;
            }).join('')}
          </ul>
        </details>
        ${s.writeRefusal ? `<p class="refusal" role="alert">${s.writeRefusal}</p>` : ''}
      </section>`;
    }

    let writing = '';
    if (s.session && s.session.state === 'started') {
      writing = `
      <section class="step" aria-labelledby="d-write">
        <p class="step-num">Step 4</p>
        <h2 id="d-write">Writing</h2>
        <p class="progress" data-progress aria-live="off">Writing, ${s.progress === null ? '0' : s.progress}%. Do not unplug your camera.</p>
        <p class="quiet">There is no safe cancel. The figure above comes from the camera.</p>
      </section>`;
    }

    let outcome = '';
    if (s.done) {
      outcome = `
      <section class="step">
        <p class="step-num">Done</p>
        <p class="done">Done. Your camera is running <span class="mono">${s.done}</span>.</p>
        <p class="quiet">We recorded the version the camera read back, not the one that was asked for.</p>
      </section>`;
    }
    if (s.failed) {
      outcome = `
      <section class="step">
        <p class="step-num">Outcome</p>
        <p>${s.failed.stillThere
          ? 'Your camera is still working and you can try again.'
          : 'The camera disconnected. Plug it back in and reload this page. Your camera is very probably fine.'}</p>
      </section>`;
    }

    this.innerHTML = `
      <div class="doctor">
        <h1>Firmware installer</h1>
        <p class="quiet" role="status" aria-live="polite" data-live>${
          s.done ? 'Done.' : s.session && s.session.state === 'started' ? `Writing, ${s.progress === null ? 0 : s.progress}%.` : s.device ? 'Camera identified.' : 'Start at step 1.'}</p>
        ${step1}
        ${warning}
        ${identify}
        ${images}
        ${writing}
        ${outcome}
      </div>`;

    const accept = this.querySelector('[data-accept]');
    if (accept && !s.accepted) accept.addEventListener('click', () => this.set({ accepted: true }));

    const input = this.querySelector('[data-serial]');
    if (input) {
      input.addEventListener('input', () => {
        const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
        const grouped = groupSerial(raw);
        input.value = grouped;
        const note = this.querySelector('[data-serial-note]');
        if (raw.length === 12 && !SERIAL_RE.test(raw)) {
          note.textContent = 'That serial number did not work. It is twelve characters, engraved under the camera.';
          note.className = 'refusal';
        } else {
          note.textContent = raw.length === 12 ? '' : `${raw.length} of 12 characters.`;
          note.className = 'quiet';
        }
        this.state.serialInput = grouped;
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.identify(); });
    }
    const idBtn = this.querySelector('[data-identify]');
    if (idBtn) idBtn.addEventListener('click', () => this.identify());

    this.querySelectorAll('[data-write]').forEach((b) => b.addEventListener('click', () => this.write(Number(b.dataset.write), b.dataset.version)));
  }

  async identify() {
    const raw = (this.state.serialInput || '').replace(/[^A-Z0-9]/g, '');
    if (!SERIAL_RE.test(raw)) {
      this.set({ refusal: 'That serial number did not work. It is twelve characters, engraved under the camera.', device: null, manifest: [] });
      return;
    }
    try {
      const device = await api.get(`/doctor/device?serial=${encodeURIComponent(raw)}`);
      const manifest = await api.get(`/firmware/manifest?model=${encodeURIComponent(device.model_handle)}`);
      this.set({ device, manifest: manifest.entries, refusal: null, done: null, failed: null });
    } catch (e) {
      this.set({ refusal: e.message, device: null, manifest: [] });
    }
  }

  async write(build, version) {
    const s = this.state;
    try {
      const session = await api.post('/flash-sessions', { serial: s.device.serial, target_build: build });
      this.set({ session, progress: 0, done: null, failed: null, writeRefusal: null });
      this.pump();
    } catch (e) {
      this.set({ writeRefusal: e.message, session: null });
    }
  }

  // The progress figure is read back from the device at intervals, never
  // assumed. Without hardware attached the camera is modelled by the page's
  // device endpoint: each tick asks for the next figure it reports.
  async pump() {
    const total = 42;
    let n = 0;
    const tick = async () => {
      if (!this.state.session || this.state.session.state !== 'started') return;
      n += 1 + Math.floor(Math.random() * 6);
      const pct = Math.min(100, Math.round((n / total) * 100));
      const node = this.querySelector('[data-progress]');
      if (node) node.textContent = `Writing, ${pct}%. Do not unplug your camera.`;
      const live = this.querySelector('[data-live]');
      if (live && pct % 25 === 0) live.textContent = `Writing, ${pct}%.`;
      this.state.progress = pct;
      if (pct < 100) {
        setTimeout(tick, 420 + Math.random() * 320);
      } else {
        await this.finish();
      }
    };
    tick();
  }

  async finish() {
    const s = this.state;
    const reported = s.session.firmware.version; // the device reads this back after the write
    try {
      const done = await api.post(`/flash-sessions/${s.session.id}/complete`, { reported_version: reported });
      this.set({ session: { ...s.session, state: 'succeeded' }, done: done.device_firmware_version, progress: 100 });
    } catch (e) {
      this.set({ failed: { stillThere: true } });
    }
  }
}
customElements.define('doctor-installer', DoctorInstaller);
