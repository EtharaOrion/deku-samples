// The product island: the option radios, the quantity stepper, the buy control
// and the gallery. The page is complete without it; this only adds behaviour.

const root = document.querySelector('[data-product]');
if (root) {
  const variants = JSON.parse(root.dataset.variants || '[]');
  const status = root.dataset.status;
  const priceEl = root.querySelector('[data-price]');
  const availEl = root.querySelector('[data-availability]');
  const qtyInput = root.querySelector('[data-qty]');
  const dec = root.querySelector('[data-dec]');
  const inc = root.querySelector('[data-inc]');
  const buy = root.querySelector('[data-buy]');
  const live = root.querySelector('[data-live]');
  const radios = Array.from(root.querySelectorAll('input[name="variant"]'));

  const money = (m) => {
    const n = Math.trunc(Number(m) || 0);
    const d = Math.trunc(Math.abs(n) / 100);
    const c = Math.abs(n) % 100;
    return `$${String(d).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${String(c).padStart(2, '0')}`;
  };

  function current() {
    const r = radios.find((x) => x.checked);
    return variants.find((v) => v.sku === (r ? r.value : '')) || variants[0];
  }

  function maxQty(v) {
    return Math.max(1, Math.min(10, v.available));
  }

  function paint() {
    const v = current();
    if (!v) return;
    priceEl.textContent = money(v.price_minor);

    // Availability is a state, not a boolean.
    let label = '';
    let disabled = false;
    let text = 'Add to cart';
    if (status === 'discontinued') {
      label = 'Discontinued';
      disabled = true;
      text = 'Discontinued';
    } else if (v.available <= 0) {
      label = 'Sold out';
      disabled = true;
      text = 'Sold out';
    } else if (v.available <= 10) {
      label = `Only ${v.available} left`;
    }
    availEl.textContent = label;
    availEl.hidden = !label;

    buy.disabled = disabled;
    buy.textContent = text;
    // Unavailability is never signalled by colour alone.
    buy.setAttribute('aria-disabled', String(disabled));

    const cap = maxQty(v);
    qtyInput.max = String(cap);
    if (Number(qtyInput.value) > cap) qtyInput.value = String(cap);
    if (Number(qtyInput.value) < 1) qtyInput.value = '1';
    dec.disabled = Number(qtyInput.value) <= 1;
    inc.disabled = Number(qtyInput.value) >= cap;

    // Choosing an option updates the address by replacing history rather than
    // pushing it, so the back control leaves the product page.
    const url = new URL(window.location.href);
    url.searchParams.set('variant', v.sku);
    history.replaceState(null, '', url);

    // Swap the gallery to that option's view.
    root.querySelectorAll('[data-view]').forEach((el) => {
      el.hidden = el.dataset.viewSku !== undefined && el.dataset.viewSku !== v.sku;
    });
  }

  radios.forEach((r) => r.addEventListener('change', paint));
  dec.addEventListener('click', () => { qtyInput.value = String(Math.max(1, Number(qtyInput.value) - 1)); paint(); });
  inc.addEventListener('click', () => { qtyInput.value = String(Math.min(maxQty(current()), Number(qtyInput.value) + 1)); paint(); });
  qtyInput.addEventListener('input', paint);

  buy.addEventListener('click', async () => {
    const v = current();
    if (!v || buy.disabled) return;
    const previous = buy.textContent;
    buy.disabled = true;
    buy.textContent = 'Adding';
    live.textContent = 'Adding to your cart.';
    try {
      const res = await fetch('/api/cart/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: v.sku, quantity: Number(qtyInput.value) }),
      });
      const data = await res.json();
      if (!res.ok) {
        live.textContent = data.message || 'That did not work.';
        buy.textContent = previous;
        buy.disabled = false;
        return;
      }
      live.textContent = `Added. Your cart holds ${data.item_count} ${data.item_count === 1 ? 'item' : 'items'}.`;
      buy.textContent = 'Added';
      const badge = document.querySelector('.cart-badge');
      const control = document.querySelector('.cart-control');
      if (control) {
        control.setAttribute('aria-label', `Cart, ${data.item_count} ${data.item_count === 1 ? 'item' : 'items'}`);
        const shown = data.item_count > 99 ? '99+' : String(data.item_count);
        if (badge) badge.textContent = shown;
        else if (data.item_count > 0) {
          const b = document.createElement('span');
          b.className = 'cart-badge tnum';
          b.setAttribute('aria-hidden', 'true');
          b.textContent = shown;
          control.appendChild(b);
        }
      }
      setTimeout(() => { buy.textContent = previous; buy.disabled = false; paint(); }, 900);
    } catch {
      live.textContent = 'That did not work. Try again.';
      buy.textContent = previous;
      buy.disabled = false;
    }
  });

  // A parameter naming a variant that does not exist renders the default and
  // drops the parameter without comment.
  const asked = new URL(window.location.href).searchParams.get('variant');
  if (asked && !variants.some((v) => v.sku === asked)) {
    const url = new URL(window.location.href);
    url.searchParams.delete('variant');
    history.replaceState(null, '', url);
  }

  paint();

  /* ------------------------------------------------------------- gallery */

  const main = root.querySelector('[data-gallery-main]');
  const thumbs = Array.from(root.querySelectorAll('[data-gallery-thumb]'));
  if (main && thumbs.length) {
    const views = Array.from(root.querySelectorAll('[data-gallery-view]'));
    function show(i) {
      views.forEach((v, n) => { v.hidden = n !== i; });
      thumbs.forEach((t, n) => t.setAttribute('aria-current', String(n === i)));
    }
    thumbs.forEach((t, i) => {
      t.addEventListener('click', () => show(i));
      // Keyboard navigable.
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const next = (i + (e.key === 'ArrowRight' ? 1 : thumbs.length - 1)) % thumbs.length;
          thumbs[next].focus();
          show(next);
        }
      });
    });
    show(0);
  }
}
