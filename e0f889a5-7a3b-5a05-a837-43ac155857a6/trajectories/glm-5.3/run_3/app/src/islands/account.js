import { api, authToken, authCustomer, setCartCount } from '../lib/client.js';
import { money, shortDateTime, orderStatusChip, SERIAL_RE, groupSerial } from '../lib/format.js';

// A signed-out request for an account route lands on /sign-in carrying the path.
class AccountGuard extends HTMLElement {
  connectedCallback() {
    const token = authToken();
    if (!token) {
      const here = window.location.pathname + window.location.search;
      window.location.href = `/sign-in?next=${encodeURIComponent(here)}`;
      this.innerHTML = '<p class="quiet">Sign in to see your account.</p>';
      return;
    }
    const section = this.getAttribute('section') || 'overview';
    const number = this.getAttribute('number');
    const serial = this.getAttribute('serial');
    this.load(section, { number, serial });
  }
  async load(section, opts = {}) {
    try {
      const me = await api.get('/auth/me');
      if (section === 'overview') return this.overview(me);
      if (section === 'orders') return this.orders(me);
      if (section === 'order') return this.oneOrder(me, opts.number);
      if (section === 'cameras') return this.cameras(me, opts);
      if (section === 'camera') return this.oneCamera(me, opts.serial);
      this.overview(me);
    } catch (e) {
      if (e.status === 401) {
        localStorage.removeItem('vela_token');
        localStorage.removeItem('vela_customer');
        const here = window.location.pathname;
        window.location.href = `/sign-in?next=${encodeURIComponent(here)}`;
        this.innerHTML = '<p>Your session has ended. Sign in again.</p>';
      } else {
        this.innerHTML = `<p class="notice" data-tone="wrong">Something went wrong at our end. Reference ${e.request_id || 'unknown'}.</p>`;
      }
    }
  }
  header(me, title) {
    return `<header class="account-head"><h1>${title}</h1><p class="quiet">${me.customer.name} · ${me.customer.email}</p></header>`;
  }
  cameraCard(d) {
    const fw = d.update_available
      ? `<span class="chip" data-tone="progress">Update available</span>`
      : d.firmware_version
        ? `<span class="chip" data-tone="finished">Firmware <span class="mono">${d.firmware_version}</span></span>`
        : `<span class="chip">Not yet connected</span>`;
    const today = new Date().toISOString().slice(0, 10);
    const warranty = d.warranty_until
      ? `<span class="chip">Warranty ${String(d.warranty_until).slice(0, 10) > today ? 'until' : 'ended'} ${String(d.warranty_until).slice(0, 10)}</span>`
      : '';
    return `<a class="card camera-card" href="/account/cameras/${d.serial}">
      <strong>${d.model}</strong>
      <span class="nickname">${d.nickname || ''}</span>
      <span class="serial mono">${d.serial}</span>
      <span class="chips">${fw}${warranty}</span>
    </a>`;
  }
  async overview(me) {
    const [devices, orders, releases] = await Promise.all([
      api.get('/account/devices').catch(() => null),
      api.get('/account/orders?page_size=2').catch(() => null),
      api.get('/releases?page_size=1').catch(() => null)
    ]);
    const latest = releases && releases.data[0];
    const seen = localStorage.getItem('vela_last_app_seen');
    const newer = latest && (!seen || Number(latest.build) > Number(seen));
    this.innerHTML = `
      <div class="account">
        ${this.header(me, 'Account')}
        <section class="section" aria-labelledby="s-cam">
          <h2 id="s-cam">Cameras</h2>
          ${devices && devices.data.length
            ? `<div class="camera-grid">${devices.data.map((d) => this.cameraCard(d)).join('')}</div>`
            : '<p class="quiet">No cameras registered yet. <a href="/account/cameras">Register one</a>.</p>'}
        </section>
        <section class="section" aria-labelledby="s-ord">
          <h2 id="s-ord">Recent orders</h2>
          ${orders && orders.data.length
            ? orders.data.map((o) => `<div class="order-row">
                <a href="/account/orders/${o.number}"><span class="mono">${o.number}</span></a>
                <span>${shortDateTime(o.placed_at)}</span>
                <span>${o.first_line_title}${o.more_lines ? ` and ${o.more_lines} more` : ''}</span>
                <span class="tnum">${money(o.total_minor)} ${o.currency}</span>
                <span class="chip">${orderStatusChip(o)}</span>
              </div>`).join('')
            : '<p class="quiet">No orders yet.</p>'}
        </section>
        <section class="section" aria-labelledby="s-app">
          <h2 id="s-app">Software</h2>
          ${latest
            ? `<p>The current application is Arranger <span class="mono">${latest.version}</span>, build <span class="mono tnum">${latest.build}</span>.
               ${newer ? 'It is newer than the one you last saw.' : 'You have seen this build.'} <a href="/downloads">Downloads</a>.</p>`
            : '<p class="quiet">No releases yet.</p>'}
        </section>
      </div>`;
    if (latest) localStorage.setItem('vela_last_app_seen', String(latest.build));
  }
  async orders(me) {
    const orders = await api.get('/account/orders?page_size=20');
    this.innerHTML = `
      <div class="account">
        ${this.header(me, 'Orders')}
        ${orders.data.length
          ? orders.data.map((o) => `<div class="order-row">
              <a href="/account/orders/${o.number}"><span class="mono">${o.number}</span></a>
              <span>${shortDateTime(o.placed_at)}</span>
              <span>${o.first_line_title}${o.more_lines ? ` and ${o.more_lines} more` : ''}</span>
              <span class="tnum">${money(o.total_minor)} ${o.currency}</span>
              <span class="chip">${orderStatusChip(o)}</span>
            </div>`).join('')
          : '<p class="quiet">No orders yet. <a href="/shop">The shop is here</a>.</p>'}
        ${orders.has_more ? '<p class="quiet"><button class="btn btn-sm" data-more>Load more</button></p>' : ''}
      </div>`;
    const more = this.querySelector('[data-more]');
    if (more) more.addEventListener('click', () => this.load('orders'));
  }
  async oneOrder(me, number) {
    try {
      const o = await api.get(`/account/orders/${number}`);
      const addr = o.shipping_address || {};
      const serialsByLine = {};
      for (const s of (o.serials || [])) (serialsByLine[s.order_line_id] = serialsByLine[s.order_line_id] || []).push(s);
      this.innerHTML = `
        <div class="account">
          ${this.header(me, `Order <span class="mono">${o.number}</span>`)}
          <p><span class="chip">${orderStatusChip(o)}</span> <span class="quiet">${shortDateTime(o.placed_at)}</span></p>
          <section class="section">
            <h2>Lines</h2>
            <table class="spec">
              <tbody>${o.lines.map((l) => `<tr>
                <td>${l.title} <span class="quiet">${l.option}</span><br /><span class="quiet mono">${l.sku}</span>
                  ${(serialsByLine[l.id] || []).map((s) => `<br /><span class="mono">${s.serial}</span> <span class="quiet">${s.model}</span>`).join('')}
                </td>
                <td class="num tnum">${money(l.unit_price_minor)}</td>
                <td class="num tnum">${l.quantity}</td>
                <td class="num tnum">${money(l.total_minor)}</td>
              </tr>`).join('')}</tbody>
            </table>
          </section>
          <section class="section">
            <h2>Totals</h2>
            <div class="sumrow"><span>Subtotal</span><span class="tnum">${money(o.subtotal_minor)}</span></div>
            <div class="sumrow"><span>Delivery, ${o.shipping_method}</span><span class="tnum">${money(o.shipping_minor)}</span></div>
            <div class="sumrow"><span>Tax</span><span class="tnum">${money(o.tax_minor)}</span></div>
            <div class="sumrow sumrow-total"><span>Total</span><span class="tnum">${money(o.total_minor)} ${o.currency}</span></div>
          </section>
          <section class="section">
            <h2>Address</h2>
            <address>${addr.name}<br />${addr.line1}${addr.line2 ? `, ${addr.line2}` : ''}<br />${addr.city}${addr.region ? `, ${addr.region}` : ''} ${addr.postal_code}<br />${addr.country}</address>
          </section>
        </div>`;
    } catch (e) {
      this.innerHTML = `<div class="account"><h1>That page does not exist.</h1><p class="quiet">Another customer's order reads as not found.</p></div>`;
    }
  }
  async cameras(me, { flashAfter = false } = {}) {
    const devices = await api.get('/account/devices');
    this.innerHTML = `
      <div class="account">
        ${this.header(me, 'Cameras')}
        <form class="register-row" data-register>
          <input data-serial-input inputmode="text" autocomplete="off" spellcheck="false" placeholder="VC26 09PV DA7Q" aria-label="Serial number" />
          <button class="btn btn-primary" type="submit">Register</button>
        </form>
        <p class="quiet" data-register-note aria-live="polite"></p>
        <div data-register-flash>${flashAfter ? '<p class="flash">Registered.</p>' : ''}</div>
        ${devices.data.length
          ? `<div class="camera-grid">${devices.data.map((d) => this.cameraCard(d)).join('')}</div>`
          : '<p class="quiet">No cameras registered yet.</p>'}
      </div>`;
    const flashHost = this.querySelector('[data-register-flash]');
    const flash = flashHost.querySelector('.flash');
    if (flash) setTimeout(() => { flash.remove(); }, 4000);
    const form = this.querySelector('[data-register]');
    const input = this.querySelector('[data-serial-input]');
    const note = this.querySelector('[data-register-note]');
    input.addEventListener('input', () => {
      const raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      input.value = groupSerial(raw);
      if (raw.length === 12 && !SERIAL_RE.test(raw)) {
        note.textContent = 'That serial number did not work. It is twelve characters, engraved under the camera.';
        note.className = 'refusal';
      } else {
        note.textContent = raw.length === 12 ? '' : `${raw.length} of 12 characters.`;
        note.className = 'quiet';
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = input.value.replace(/[^A-Z0-9]/g, '');
      if (!SERIAL_RE.test(raw)) {
        note.textContent = 'That serial number did not work. It is twelve characters, engraved under the camera.';
        note.className = 'refusal';
        return;
      }
      try {
        const d = await api.post('/account/devices', { serial: raw });
        await this.load('cameras', { flashAfter: true });
      } catch (e2) {
        note.textContent = e2.message;
        note.className = 'refusal';
      }
    });
  }
  async oneCamera(me, serial) {
    try {
      const devices = await api.get('/account/devices?page_size=100');
      const d = devices.data.find((x) => x.serial.toUpperCase() === serial.toUpperCase());
      if (!d) throw new Error('not found');
      this.innerHTML = `
        <div class="account">
          ${this.header(me, `${d.model} <span class="mono">${d.serial}</span>`)}
          <section class="section">
            <h2>This camera</h2>
            <p>Nickname: ${d.nickname || 'none yet'}</p>
            <p>Firmware: <span class="mono">${d.firmware_version || 'not yet connected'}</span>${d.update_available ? ` <span class="chip" data-tone="progress">Update available</span> <a href="/doctor">Install it</a>` : ''}</p>
            <p>Warranty: ${d.warranty_until ? String(d.warranty_until).slice(0, 10) : 'not recorded'}</p>
          </section>
          <section class="section">
            <h2>Change the name</h2>
            <form class="register-row" data-rename>
              <input data-nickname value="${d.nickname || ''}" maxlength="60" aria-label="Nickname" />
              <button class="btn" type="submit">Save name</button>
            </form>
            <p class="quiet" data-rename-note aria-live="polite"></p>
          </section>
          <section class="section">
            <h2>Let it go</h2>
            <p class="quiet">Removing releases the camera without giving it to anyone. It is what you do when you sell it to a stranger. Handing it to someone else is a different thing: release it here and the new owner registers it themselves.</p>
            <button class="btn" data-release type="button">Remove from my account</button>
            <p class="quiet" data-release-note aria-live="polite"></p>
          </section>
        </div>`;
      const renameNote = this.querySelector('[data-rename-note]');
      this.querySelector('[data-rename]').addEventListener('submit', async (e) => {
        e.preventDefault();
        const nickname = this.querySelector('[data-nickname]').value.trim();
        try {
          await api.patch(`/account/devices/${d.serial}`, { nickname });
          renameNote.textContent = 'Saved.';
          renameNote.className = 'quiet';
        } catch (e2) { renameNote.textContent = e2.message; renameNote.className = 'refusal'; }
      });
      const releaseNote = this.querySelector('[data-release-note]');
      this.querySelector('[data-release]').addEventListener('click', async () => {
        if (!confirm('Remove this camera from your account? It is not given to anyone.')) return;
        try {
          await api.del(`/account/devices/${d.serial}`);
          window.location.href = '/account/cameras';
        } catch (e2) { releaseNote.textContent = e2.message; releaseNote.className = 'refusal'; }
      });
    } catch (e) {
      this.innerHTML = `<div class="account"><h1>That page does not exist.</h1><p class="quiet">Another customer's camera reads as not found.</p></div>`;
    }
  }
}
customElements.define('account-guard', AccountGuard);
