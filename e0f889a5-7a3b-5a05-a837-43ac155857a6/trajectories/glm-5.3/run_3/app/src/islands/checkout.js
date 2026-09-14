import { api, setCartCount } from '../lib/client.js';
import { money } from '../lib/format.js';

const STEPS = [
  { n: 1, href: '/checkout/where-it-goes', label: 'Where it goes' },
  { n: 2, href: '/checkout/how-it-gets-there', label: 'How it gets there' },
  { n: 3, href: '/checkout/payment', label: 'Payment' }
];

class CheckoutSteps extends HTMLElement {
  connectedCallback() {
    const current = Number(this.getAttribute('step'));
    this.innerHTML = `<ol class="checkout-steps">
      ${STEPS.map((s) => `<li class="${s.n === current ? 'is-current' : ''}">
        ${s.n === current ? `${s.n}. ${s.label}` : `<a href="${s.href}">${s.n}. ${s.label}</a>`}
      </li>`).join('')}
    </ol>`;
  }
}
customElements.define('checkout-steps', CheckoutSteps);

const persist = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const recall = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };

const addressFields = [
  ['email', 'Email', 'email', true, 'wide'],
  ['name', 'Name', 'text', true],
  ['line1', 'Address line 1', 'text', true, 'wide'],
  ['line2', 'Address line 2 (optional)', 'text', false, 'wide'],
  ['city', 'City', 'text', true],
  ['region', 'Region', 'text', false],
  ['postal_code', 'Postal code', 'text', true],
  ['country', 'Country', 'text', true],
  ['phone', 'Phone (optional)', 'tel', false, 'wide']
];

class CheckoutAddress extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="checkout-grid">
        <form class="card" novalidate>
          <h1 class="page-title">Where it goes</h1>
          <p class="page-sub">We ship to the United States.</p>
          <div class="form-grid">
            ${addressFields.map(([name, label, type, req, wide]) => `
              <div class="field ${wide || ''}">
                <label for="f-${name}">${label}${req ? '' : ''}</label>
                <input id="f-${name}" name="${name}" type="${type}" ${name === 'country' ? 'value="US"' : ''} autocomplete="on" />
                <p class="field-error" data-error-for="${name}"></p>
              </div>`).join('')}
            <label class="consent">
              <input type="checkbox" id="f-consent" />
              <span>Email me about firmware for the cameras I own. Nothing else.</span>
            </label>
          </div>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-primary" type="submit">Continue to delivery</button>
        </form>
        <aside class="card" data-summary aria-label="Summary"><div class="skeleton" style="height:10rem"></div></aside>
      </div>`;
    this.querySelector('#f-email').value = recall('vela_co_email');
    this.querySelector('#f-consent').checked = recall('vela_co_consent') === '1';
    this.querySelector('form').addEventListener('submit', (e) => this.submit(e));
    this.summary();
  }
  async summary() {
    const c = await api.get('/cart');
    this.renderSummary(c);
  }
  renderSummary(c) {
    const host = this.querySelector('[data-summary]');
    if (!host) return;
    host.innerHTML = `
      <h2 class="summary-title">Order so far</h2>
      <ul class="sum-lines">
        ${c.lines.map((l) => `<li><span>${l.title} × ${l.quantity}</span><span class="tnum">${money(l.line_total_minor)}</span></li>`).join('') || '<li>No items yet.</li>'}
      </ul>
      <div class="sumrow"><span>Subtotal</span><span class="tnum">${money(c.subtotal_minor)}</span></div>
      <p class="estimate-note">Estimated. We will show the exact amount once we know where it is going.</p>`;
  }
  async submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const err = this.querySelector('.form-error');
    err.textContent = '';
    const values = {};
    for (const [name] of addressFields) values[name] = form.querySelector(`[name="${name}"]`).value.trim();
    const consent = this.querySelector('#f-consent').checked;
    persist('vela_co_email', values.email);
    persist('vela_co_consent', consent ? '1' : '0');
    let bad = false;
    for (const [name, label, , req] of addressFields) {
      const p = this.querySelector(`[data-error-for="${name}"]`);
      p.textContent = '';
      if (req && !values[name]) { p.textContent = `${label.replace(' (optional)', '')} is required.`; bad = true; }
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email) && !this.querySelector('[data-error-for="email"]').textContent) {
      this.querySelector('[data-error-for="email"]').textContent = 'Email is required.';
      bad = true;
    }
    if (bad) return;
    try {
      const c = await api.post('/cart/delivery', {
        email: values.email,
        marketing_consent: consent,
        shipping_address: {
          name: values.name, line1: values.line1, line2: values.line2, city: values.city,
          region: values.region, postal_code: values.postal_code, country: values.country, phone: values.phone
        }
      });
      Object.entries(values).forEach(([k, v]) => persist(`vela_co_${k}`, v));
      window.location.href = '/checkout/how-it-gets-there';
    } catch (e2) {
      err.textContent = e2.message || 'That did not work.';
    }
  }
}
customElements.define('checkout-address', CheckoutAddress);

class CheckoutDelivery extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="checkout-grid">
        <form class="card" novalidate>
          <h1 class="page-title">How it gets there</h1>
          <p class="page-sub">Choose one. Neither is chosen for you.</p>
          <div class="method-list" role="radiogroup" aria-label="Delivery method">
            <div class="skeleton" style="height:4rem"></div>
          </div>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-primary" type="submit" data-continue disabled>Loading delivery options</button>
        </form>
        <aside class="card" data-summary aria-label="Summary"><div class="skeleton" style="height:10rem"></div></aside>
      </div>`;
    this.querySelector('form').addEventListener('submit', (e) => this.submit(e));
    this.load();
  }
  async load() {
    try {
      const c = await api.get('/cart');
      this.cart = c;
      const list = this.querySelector('.method-list');
      const chosen = recall('vela_co_method');
      const preselect = c.shipping_method || '';
      list.innerHTML = (c.delivery_options || []).map((m) => `
        <label class="method ${preselect === m.method || (!preselect && m.method === chosen) ? 'is-selected' : ''}">
          <input type="radio" name="method" value="${m.method}" ${preselect === m.method || (!preselect && m.method === chosen) ? 'checked' : ''} />
          <span>${m.method}</span>
          <span class="tnum">${m.price_minor === 0 ? 'Free' : money(m.price_minor)}</span>
          <span class="method-note">${m.min_days === m.max_days ? `${m.max_days} days` : `${m.min_days} to ${m.max_days} days`}</span>
        </label>`).join('') || '<p class="estimate-note">We need an address before we can quote delivery. <a href="/checkout/where-it-goes">Add one</a>.</p>';
      list.querySelectorAll('input').forEach((r) => r.addEventListener('change', () => {
        list.querySelectorAll('.method').forEach((m) => m.classList.remove('is-selected'));
        r.closest('.method').classList.add('is-selected');
      }));
      const btn = this.querySelector('[data-continue]');
      if ((c.delivery_options || []).length) {
        btn.disabled = false;
        btn.textContent = 'Continue to payment';
      } else {
        btn.textContent = 'Continue to payment';
      }
      this.renderSummary(c);
    } catch (e) {
      this.querySelector('.form-error').textContent = e.message;
    }
  }
  renderSummary(c) {
    const host = this.querySelector('[data-summary]');
    host.innerHTML = `
      <h2 class="summary-title">Order so far</h2>
      <ul class="sum-lines">
        ${c.lines.map((l) => `<li><span>${l.title} × ${l.quantity}</span><span class="tnum">${money(l.line_total_minor)}</span></li>`).join('')}
      </ul>
      <div class="sumrow"><span>Subtotal</span><span class="tnum">${money(c.subtotal_minor)}</span></div>
      <div class="sumrow"><span>Estimated delivery</span><span class="tnum">—</span></div>
      <div class="sumrow"><span>Estimated tax</span><span class="tnum">—</span></div>
      <p class="estimate-note">Estimated. We will show the exact amount once we know where it is going.</p>`;
  }
  async submit(e) {
    e.preventDefault();
    const err = this.querySelector('.form-error');
    err.textContent = '';
    const picked = this.querySelector('input[name="method"]:checked');
    if (!picked) { err.textContent = 'Choose how the order gets there.'; return; }
    try {
      const c = await api.post('/cart/delivery', { shipping_method: picked.value });
      persist('vela_co_method', picked.value);
      window.location.href = '/checkout/payment';
    } catch (e2) {
      err.textContent = e2.message;
    }
  }
}
customElements.define('checkout-delivery', CheckoutDelivery);

class CheckoutPlace extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="checkout-grid">
        <section class="card">
          <h1 class="page-title">Payment</h1>
          <p class="page-sub">We invoice the order when it is placed. There is no card form.</p>
          <div data-body><div class="skeleton" style="height:8rem"></div></div>
        </section>
        <aside class="card" data-summary aria-label="Summary"><div class="skeleton" style="height:10rem"></div></aside>
      </div>`;
    this.load();
  }
  async load() {
    try {
      const c = await api.get('/cart');
      if (!c.lines.length) {
        this.querySelector('[data-body]').innerHTML = '<p>Your cart is empty.</p>';
        this.querySelector('[data-summary]').innerHTML = '<p><a class="btn" href="/shop">Back to the shop</a></p>';
        return;
      }
      const ready = c.address_known && c.shipping_method;
      this.querySelector('[data-summary]').innerHTML = `
        <h2 class="summary-title">Order total</h2>
        <ul class="sum-lines">
          ${c.lines.map((l) => `<li><span>${l.title} × ${l.quantity}</span><span class="tnum">${money(l.line_total_minor)}</span></li>`).join('')}
        </ul>
        <div class="sumrow"><span>Subtotal</span><span class="tnum">${money(c.subtotal_minor)}</span></div>
        ${c.protection_minor ? `<div class="sumrow"><span>Shipment protection</span><span class="tnum">${money(c.protection_minor)}</span></div>` : ''}
        <div class="sumrow"><span>Delivery (${c.shipping_method || 'not chosen'})</span><span class="tnum">${c.shipping_minor !== null ? money(c.shipping_minor) : '—'}</span></div>
        <div class="sumrow"><span>Tax</span><span class="tnum">${c.tax_minor !== null ? money(c.tax_minor) : '—'}</span></div>
        <div class="sumrow sumrow-total"><span>Total</span><span class="tnum">${c.total_minor !== null ? money(c.total_minor) : '—'}</span></div>
        <p class="estimate-note">To ${c.email || 'an address we do not have yet'}.</p>`;
      this.querySelector('[data-body]').innerHTML = `
        ${ready ? '' : '<div class="notice" data-tone="wrong">We still need <a href="/checkout/where-it-goes">where it goes</a> and <a href="/checkout/how-it-gets-there">how it gets there</a>.</div>'}
        <p class="placing-note" role="status"></p>
        <button class="btn btn-primary" data-place ${ready ? '' : 'disabled'}>Place the order</button>`;
      const btn = this.querySelector('[data-place]');
      btn.addEventListener('click', () => this.place(btn));
    } catch (e) {
      this.querySelector('[data-body]').innerHTML = `<p class="notice" data-tone="wrong">${e.message}</p>`;
    }
  }
  async place(btn) {
    const note = this.querySelector('.placing-note');
    btn.disabled = true;
    btn.textContent = 'Placing your order';
    note.textContent = 'Placing your order';
    let key = recall('vela_place_key');
    if (!key) {
      key = `pk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      persist('vela_place_key', key);
    }
    try {
      const order = await api.post('/orders', {}, { 'Idempotency-Key': key });
      localStorage.removeItem('vela_place_key');
      setCartCount(0);
      window.location.href = `/orders/${order.number}?access_token=${encodeURIComponent(order.access_token)}`;
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Place the order';
      note.textContent = e.message || 'That did not work.';
      if (e.code === 'prices_changed') {
        setTimeout(() => { window.location.href = '/cart'; }, 1200);
      }
    }
  }
}
customElements.define('checkout-place', CheckoutPlace);
