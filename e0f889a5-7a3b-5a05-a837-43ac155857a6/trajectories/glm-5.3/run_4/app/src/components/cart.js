/** The cart: optimistic quantities, server authoritative, notices that stay. */
export function mountCart(root) {
  if (!root) return;
  let cart = JSON.parse(root.dataset.initial || 'null');
  const hasLines = cart && cart.lines.length > 0;

  root.innerHTML = hasLines ? renderCart(cart) : emptyState();

  function emptyState() {
    return `<p class="empty">Your cart is empty. <a href="/shop">See what we make</a>.</p>`;
  }

  function money(minor) {
    const sign = minor < 0 ? '-' : '';
    const abs = Math.abs(Math.trunc(minor));
    return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }

  function renderCart(c) {
    return `
      ${c.notices.map((n) => `<p class="notice notice-wrong" role="alert">${escapeHtml(n.message)}</p>`).join('')}
      <ul class="cart-lines">
        ${c.lines
          .map(
            (l) => `
          <li class="cart-line" data-line="${l.id}">
            <div class="line-thumb" aria-hidden="true"></div>
            <div class="line-info">
              <a href="/shop/${l.product_handle}">${escapeHtml(l.product_title)}</a>
              <span class="line-option">${escapeHtml(l.option_value)}</span>
            </div>
            <div class="line-price tnum">${money(l.unit_price_minor)}</div>
            <div class="stepper" data-stepper data-line-id="${l.id}">
              <button type="button" data-step="-1" aria-label="Decrease quantity of ${escapeHtml(l.product_title)}">−</button>
              <input type="number" min="1" max="10" value="${l.quantity}" data-qty aria-label="Quantity" />
              <button type="button" data-step="1" aria-label="Increase quantity of ${escapeHtml(l.product_title)}">+</button>
            </div>
            <div class="line-total tnum" data-line-total>${money(l.line_total_minor)}</div>
            <button type="button" class="link-btn" data-remove aria-label="Remove ${escapeHtml(l.product_title)}">Remove</button>
          </li>`
          )
          .join('')}
      </ul>

      <div class="cart-summary">
        <h2>Summary</h2>
        <dl class="summary-rows">
          <div><dt>Subtotal</dt><dd class="tnum" data-subtotal>${money(c.subtotal_minor)}</dd></div>
          <div><dt>Estimated delivery</dt><dd class="tnum" data-shipping>${money(c.shipping_minor)}</dd></div>
          <div><dt>Estimated tax</dt><dd class="tnum" data-tax>${money(c.tax_minor)}</dd></div>
          ${c.protection_rung ? protectionRow(c) : ''}
          <div class="summary-total"><dt>Total</dt><dd class="tnum" data-total>${money(c.total_minor)}</dd></div>
        </dl>
        <p class="summary-note">Estimated. We will show the exact amount once we know where it is going.</p>
        <a class="btn btn-primary" href="/checkout/where-it-goes">Checkout</a>
      </div>
    `;
  }

  function protectionRow(c) {
    const on = c.protection_enabled;
    return `
      <div class="protect-row">
        <label>
          <input type="checkbox" data-protection ${on ? 'checked' : ''} />
          Protect this shipment against loss, theft and damage for ${money(c.protection_rung.price_minor)}
        </label>
      </div>`;
  }

  function rerender() {
    if (!cart || cart.lines.length === 0) {
      root.innerHTML = emptyState();
      return;
    }
    root.innerHTML = renderCart(cart);
  }

  async function call(path, method, body) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data?.error?.message || 'That did not work.'), { data });
    cart = data;
    return data;
  }

  root.addEventListener('click', async (e) => {
    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn) {
      const stepper = stepBtn.closest('[data-stepper]');
      const lineId = Number(stepper.dataset.lineId);
      const input = stepper.querySelector('[data-qty]');
      const current = Number(input.value);
      const next = Math.min(10, Math.max(1, current + Number(stepBtn.dataset.step)));
      // Optimistic: the number moves at once.
      input.value = String(next);
      stepper.classList.add('pending');
      try {
        await call(`/api/cart/lines/${lineId}`, 'PATCH', { quantity: next });
      } catch (err) {
        input.value = String(current);
        announce(err.message);
      } finally {
        stepper.classList.remove('pending');
      }
      rerender();
      return;
    }

    const removeBtn = e.target.closest('[data-remove]');
    if (removeBtn) {
      const lineEl = removeBtn.closest('[data-line]');
      const lineId = Number(lineEl.dataset.line);
      try {
        await call(`/api/cart/lines/${lineId}`, 'DELETE');
        rerender();
      } catch (err) {
        announce(err.message);
      }
    }
  });

  root.addEventListener('change', async (e) => {
    if (e.target.matches('[data-qty]')) {
      const stepper = e.target.closest('[data-stepper]');
      const lineId = Number(stepper.dataset.lineId);
      const next = Math.min(10, Math.max(1, Math.trunc(Number(e.target.value) || 1)));
      e.target.value = String(next);
      try {
        await call(`/api/cart/lines/${lineId}`, 'PATCH', { quantity: next });
      } catch (err) {
        announce(err.message);
      }
      rerender();
      return;
    }
    if (e.target.matches('[data-protection]')) {
      try {
        await call('/api/cart/protection', 'POST', { enabled: e.target.checked });
        rerender();
      } catch (err) {
        announce(err.message);
      }
    }
  });

  function announce(message) {
    let live = root.querySelector('[data-cart-live]');
    if (!live) {
      live = document.createElement('p');
      live.setAttribute('data-cart-live', '');
      live.setAttribute('role', 'alert');
      live.className = 'feedback';
      root.prepend(live);
    }
    live.textContent = message;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}
