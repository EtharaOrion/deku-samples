import { api, setCartCount } from '../lib/client.js';
import { money } from '../lib/format.js';

class BuyControl extends HTMLElement {
  connectedCallback() {
    const sku = this.getAttribute('sku');
    const disabled = this.hasAttribute('disabled');
    const label = this.getAttribute('label') || 'Add to cart';
    const max = Number(this.getAttribute('max-qty') || 10);
    this.innerHTML = `
      <div class="buy">
        <div class="qty">
          <button type="button" class="qty-btn" data-step="-1" aria-label="Decrease quantity">−</button>
          <input class="qty-num tnum" type="number" min="1" max="${max}" value="1" aria-label="Quantity" inputmode="numeric" />
          <button type="button" class="qty-btn" data-step="1" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="btn btn-primary buy-btn" ${disabled ? 'disabled' : ''}>${disabled ? label : 'Add to cart'}</button>
      </div>
      <p class="buy-note" role="status"></p>`;
    const num = this.querySelector('.qty-num');
    const note = this.querySelector('.buy-note');
    if (disabled) {
      num.disabled = true;
      this.querySelectorAll('.qty-btn').forEach((b) => (b.disabled = true));
      note.textContent = 'Unavailable to buy';
      return;
    }
    this.querySelectorAll('.qty-btn').forEach((b) => b.addEventListener('click', () => {
      const v = Math.min(max, Math.max(1, Number(num.value) + Number(b.dataset.step)));
      num.value = v;
    }));
    this.querySelector('.buy-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      note.textContent = 'Adding';
      try {
        const cart = await api.post('/cart/lines', { sku, quantity: Number(num.value) });
        const n = cart.lines.reduce((s, l) => s + l.quantity, 0);
        setCartCount(n);
        note.textContent = 'Added to cart.';
      } catch (err) {
        note.textContent = err.message || 'That did not work.';
      } finally {
        btn.disabled = false;
      }
    });
  }
}
customElements.define('buy-control', BuyControl);
