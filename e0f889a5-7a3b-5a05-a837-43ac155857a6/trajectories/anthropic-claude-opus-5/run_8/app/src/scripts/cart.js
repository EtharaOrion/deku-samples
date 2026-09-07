// The cart island. Quantities are optimistic in the interface and authoritative
// on the server: the number moves at once, the totals show a pending state, and
// a rejection reverts the number and states the reason.

const root = document.querySelector('[data-cart]');
if (root) {
  const live = root.querySelector('[data-live]');
  const totals = root.querySelector('[data-totals]');

  const money = (m) => {
    const n = Math.trunc(Number(m) || 0);
    const d = Math.trunc(Math.abs(n) / 100);
    const c = Math.abs(n) % 100;
    return `${n < 0 ? '-' : ''}$${String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${String(c).padStart(2, '0')}`;
  };

  function pending(on) {
    if (totals) totals.classList.toggle('is-pending', on);
  }

  function paintTotals(cart) {
    for (const [key, value] of Object.entries({
      subtotal: cart.subtotal_minor,
      shipping: cart.shipping_minor,
      tax: cart.tax_minor,
      total: cart.total_minor,
    })) {
      const el = root.querySelector(`[data-total="${key}"]`);
      if (el) el.textContent = money(value);
    }
    const count = document.querySelector('.cart-badge');
    const control = document.querySelector('.cart-control');
    if (control) {
      control.setAttribute('aria-label', `Cart, ${cart.item_count} ${cart.item_count === 1 ? 'item' : 'items'}`);
      if (count) {
        if (cart.item_count > 0) count.textContent = cart.item_count > 99 ? '99+' : String(cart.item_count);
        else count.remove();
      }
    }
    // A cart that has emptied is a different page.
    if (cart.lines.length === 0) window.location.reload();
  }

  async function call(path, init) {
    pending(true);
    try {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      });
      const data = await res.json();
      pending(false);
      return { ok: res.ok, data };
    } catch {
      pending(false);
      return { ok: false, data: { message: 'That did not work. Try again.' } };
    }
  }

  root.querySelectorAll('[data-line]').forEach((lineEl) => {
    const id = lineEl.dataset.line;
    const input = lineEl.querySelector('[data-qty]');
    const dec = lineEl.querySelector('[data-dec]');
    const inc = lineEl.querySelector('[data-inc]');
    const totalEl = lineEl.querySelector('[data-line-total]');
    const unit = Number(lineEl.dataset.unit || 0);
    const err = lineEl.querySelector('[data-line-error]');
    let settled = Number(input.value);

    async function set(next) {
      if (next === settled) return;
      const previous = settled;
      // Optimistic: the number moves at once.
      input.value = String(next);
      if (totalEl) totalEl.textContent = money(unit * next);
      dec.disabled = next <= 1;
      if (err) { err.textContent = ''; err.hidden = true; }

      const { ok, data } = await call(`/api/cart/lines/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: next }),
      });

      if (!ok) {
        // A rejection reverts the number and states the reason.
        input.value = String(previous);
        if (totalEl) totalEl.textContent = money(unit * previous);
        dec.disabled = previous <= 1;
        if (err) { err.textContent = data.message || 'That did not work.'; err.hidden = false; }
        live.textContent = data.message || 'That did not work.';
        return;
      }
      settled = next;
      paintTotals(data);
      live.textContent = `Quantity updated to ${next}.`;
    }

    dec.addEventListener('click', () => set(Math.max(1, Number(input.value) - 1)));
    inc.addEventListener('click', () => set(Math.min(10, Number(input.value) + 1)));
    input.addEventListener('change', () => {
      const n = Math.max(1, Math.min(10, Number(input.value) || 1));
      set(n);
    });

    const remove = lineEl.querySelector('[data-remove]');
    if (remove) {
      remove.addEventListener('click', async () => {
        // Every destructive action confirms first.
        if (!window.confirm(`Remove ${lineEl.dataset.title} from your cart?`)) return;
        const { ok, data } = await call(`/api/cart/lines/${id}`, { method: 'DELETE' });
        if (!ok) {
          live.textContent = data.message || 'That did not work.';
          return;
        }
        lineEl.remove();
        paintTotals(data);
        live.textContent = 'Removed from your cart.';
      });
    }
  });

  const protect = root.querySelector('[data-protection]');
  if (protect) {
    protect.addEventListener('change', async () => {
      const { ok, data } = await call('/api/cart/protection', {
        method: 'POST',
        body: JSON.stringify({ enabled: protect.checked }),
      });
      if (!ok) {
        protect.checked = !protect.checked;
        live.textContent = data.message || 'That did not work.';
        return;
      }
      paintTotals(data);
      live.textContent = protect.checked ? 'Shipment protection added.' : 'Shipment protection removed.';
    });
  }
}
