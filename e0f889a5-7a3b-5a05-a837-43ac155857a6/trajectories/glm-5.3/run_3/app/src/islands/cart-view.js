import { api, setCartCount } from '../lib/client.js';
import { money } from '../lib/format.js';

class CartView extends HTMLElement {
  connectedCallback() {
    this.render('<div class="skeleton" style="height:12rem"></div>');
    this.load();
  }
  async load() {
    try {
      const cart = await api.get('/cart');
      setCartCount(cart.lines.reduce((s, l) => s + l.quantity, 0));
      this.render(this.html(cart));
      this.wire(cart);
    } catch (e) {
      this.render(`<p class="notice" data-tone="wrong" role="alert">That did not work. ${e.message || ''}</p>`);
    }
  }
  html(c) {
    if (!c.lines.length) {
      return `<div class="empty">
        <h1 class="page-title">Your cart is empty.</h1>
        <p><a class="btn" href="/shop">Back to the shop</a></p>
      </div>`;
    }
    const notices = (c.notices || []).map((n) => n.kind === 'price_changed'
      ? `<div class="notice" data-tone="wrong" role="alert">The price of ${n.item} changed from ${money(n.from_minor)} to ${money(n.to_minor)} since you added it.</div>`
      : `<div class="notice" data-tone="wrong" role="alert">${n.item} is sold out. Remove it to continue.</div>`).join('');
    const protection = c.protection_rung
      ? `<label class="protect">
          <input type="checkbox" id="protection-toggle" ${c.protection_enabled ? 'checked' : ''} />
          <span>Protect this shipment against loss, theft and damage for ${money(c.protection_rung.price_minor)}</span>
        </label>`
      : '';
    const est = c.address_known && c.shipping_method;
    return `
      <h1 class="page-title">Cart</h1>
      ${notices ? `<div class="notices">${notices}</div>` : ''}
      <div class="cart-grid">
        <ul class="lines">
          ${c.lines.map((l) => `
            <li class="line card" data-line="${l.id}">
              <div class="line-thumb" data-sku="${l.sku}"></div>
              <div class="line-info">
                <p class="line-title">${l.title}</p>
                <p class="line-variant">${l.option_value}</p>
                <p class="line-unit tnum">${money(l.current_price_minor)} each</p>
              </div>
              <div class="line-qty">
                <button type="button" class="qty-btn" data-step="-1" aria-label="Decrease quantity of ${l.title}">−</button>
                <input class="qty-num tnum" type="number" min="1" max="10" value="${l.quantity}" aria-label="Quantity of ${l.title}" />
                <button type="button" class="qty-btn" data-step="1" aria-label="Increase quantity of ${l.title}">+</button>
              </div>
              <p class="line-total tnum" data-total>${money(l.line_total_minor)}</p>
              <button type="button" class="btn btn-sm line-remove" data-remove>Remove</button>
            </li>`).join('')}
        </ul>
        <aside class="summary card" aria-label="Summary">
          <h2 class="summary-title">Summary</h2>
          <dl class="sumrows">
            <div class="sumrow"><dt>Subtotal</dt><dd class="tnum">${money(c.subtotal_minor - (c.protection_minor || 0))}</dd></div>
            ${c.protection_minor ? `<div class="sumrow"><dt>Shipment protection</dt><dd class="tnum">${money(c.protection_minor)}</dd></div>` : ''}
            <div class="sumrow"><dt>${est ? 'Delivery' : 'Estimated delivery'}</dt><dd class="tnum">${est ? money(c.shipping_minor) : '—'}</dd></div>
            <div class="sumrow"><dt>${est ? 'Tax' : 'Estimated tax'}</dt><dd class="tnum">${est ? money(c.tax_minor) : '—'}</dd></div>
            <div class="sumrow sumrow-total"><dt>${est ? 'Total' : 'Estimated total'}</dt><dd class="tnum">${est ? money(c.total_minor) : '—'}</dd></div>
          </dl>
          ${est ? '' : '<p class="estimate-note">Estimated. We will show the exact amount once we know where it is going.</p>'}
          ${protection}
          <a class="btn btn-primary checkout-link" href="/checkout/where-it-goes">Check out</a>
        </aside>
      </div>`;
  }
  render(html) {
    this.innerHTML = html;
  }
  wire(c) {
    this.querySelectorAll('.line').forEach((li) => {
      const lineId = Number(li.dataset.line);
      const num = li.querySelector('.qty-num');
      const total = li.querySelector('[data-total]');
      const unit = Number(num.value) > 0 ? null : null;
      const patch = async (quantity) => {
        const before = num.value;
        num.value = quantity;
        li.setAttribute('data-pending', '');
        try {
          const cart = await api.patch(`/cart/lines/${lineId}`, { quantity });
          setCartCount(cart.lines.reduce((s, l) => s + l.quantity, 0));
          this.render(this.html(cart));
          this.wire(cart);
        } catch (e) {
          num.value = before;
          li.removeAttribute('data-pending');
          const note = li.querySelector('.line-note') || document.createElement('p');
          note.className = 'line-note';
          note.setAttribute('role', 'alert');
          note.textContent = e.message;
          li.appendChild(note);
        }
      };
      li.querySelectorAll('.qty-btn').forEach((b) => b.addEventListener('click', () => {
        const v = Math.min(10, Math.max(1, Number(num.value) + Number(b.dataset.step)));
        patch(v);
      }));
      num.addEventListener('change', () => {
        const v = Math.min(10, Math.max(1, Number(num.value) || 1));
        patch(v);
      });
      li.querySelector('[data-remove]').addEventListener('click', async () => {
        try {
          const cart = await api.del(`/cart/lines/${lineId}`);
          setCartCount(cart.lines.reduce((s, l) => s + l.quantity, 0));
          this.render(this.html(cart));
          this.wire(cart);
        } catch (e) {
          const note = document.createElement('p');
          note.className = 'line-note';
          note.setAttribute('role', 'alert');
          note.textContent = e.message;
          li.appendChild(note);
        }
      });
    });
    const toggle = this.querySelector('#protection-toggle');
    if (toggle) toggle.addEventListener('change', async () => {
      try {
        const cart = await api.post('/cart/protection', { enabled: toggle.checked });
        setCartCount(cart.lines.reduce((s, l) => s + l.quantity, 0));
        this.render(this.html(cart));
        this.wire(cart);
      } catch (e) {
        toggle.checked = !toggle.checked;
      }
    });
  }
}
customElements.define('cart-view', CartView);
