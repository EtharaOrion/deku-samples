/** The product buy control: option radio group, quantity stepper, add to cart. */
export function mountBuy(root) {
  if (!root) return;
  const variants = JSON.parse(root.dataset.variants);
  const handle = root.dataset.productHandle;
  let selected = root.dataset.selected;
  let quantity = 1;

  root.innerHTML = `
    <form data-buy-form>
      <fieldset data-option-group>
        <legend>Choose an option</legend>
        ${variants
          .map(
            (v) => `
          <label class="option">
            <input type="radio" name="variant" value="${v.sku}" ${v.sku === selected ? 'checked' : ''} />
            <span>${v.option}</span>
            <span class="tnum">$${(v.price_minor / 100).toFixed(2)}</span>
            ${v.state === 'low' ? `<span class="option-note">${v.label}</span>` : ''}
            ${v.state === 'sold_out' ? `<span class="option-note">${v.label}</span>` : ''}
          </label>`
          )
          .join('')}
      </fieldset>

      <div class="stepper" data-stepper>
        <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
        <input type="number" min="1" max="10" value="1" data-quantity aria-label="Quantity" />
        <button type="button" data-step="1" aria-label="Increase quantity">+</button>
      </div>

      <p class="availability" data-availability role="status"></p>

      <button type="submit" class="btn btn-primary" data-add>Add to cart</button>
      <p class="feedback" data-feedback role="status" aria-live="polite"></p>
    </form>
  `;

  const form = root.querySelector('[data-buy-form]');
  const qtyInput = root.querySelector('[data-quantity]');
  const avail = root.querySelector('[data-availability]');
  const addBtn = root.querySelector('[data-add]');
  const feedback = root.querySelector('[data-feedback]');

  function current() {
    return variants.find((v) => v.sku === selected);
  }

  function maxFor(v) {
    return Math.min(10, v.available ?? 0);
  }

  function render() {
    const v = current();
    if (!v) return;
    qtyInput.max = String(maxFor(v));
    if (quantity > maxFor(v)) quantity = Math.max(1, maxFor(v));
    qtyInput.value = String(quantity);

    if (v.state === 'sold_out') {
      avail.textContent = 'Sold out';
      addBtn.disabled = true;
      addBtn.textContent = 'Sold out';
    } else if (v.state === 'discontinued') {
      avail.textContent = 'Discontinued. We no longer sell this.';
      addBtn.disabled = true;
      addBtn.textContent = 'We no longer sell this';
    } else {
      avail.textContent = v.state === 'low' ? v.label : '';
      addBtn.disabled = false;
      addBtn.textContent = 'Add to cart';
    }
    // Unavailability is never signalled by colour alone: the label says why.
    const stepper = root.querySelector('[data-stepper]');
    if (stepper) stepper.style.display = v.state === 'discontinued' || v.state === 'sold_out' ? 'none' : '';
  }

  form.addEventListener('change', (e) => {
    if (e.target.name !== 'variant') return;
    selected = e.target.value;
    quantity = 1;
    render();
    // Replacing history so the back control leaves the product page.
    const url = new URL(window.location.href);
    url.searchParams.set('variant', selected);
    window.history.replaceState({}, '', url);
  });

  root.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.step);
      quantity = Math.min(Math.max(1, quantity + delta), Math.max(1, maxFor(current())));
      render();
    });
  });

  qtyInput.addEventListener('change', () => {
    const n = Number(qtyInput.value);
    quantity = Number.isFinite(n) ? Math.min(Math.max(1, Math.trunc(n)), Math.max(1, maxFor(current()))) : 1;
    render();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = current();
    if (!v || v.state === 'sold_out' || v.state === 'discontinued') return;
    addBtn.disabled = true;
    feedback.textContent = 'Adding';
    try {
      const res = await fetch('/api/cart/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: v.sku, quantity }),
      });
      const body = await res.json();
      if (!res.ok) {
        feedback.textContent = body?.error?.message || 'That did not work.';
        return;
      }
      feedback.textContent = 'Added to cart.';
      window.location.href = '/cart';
    } catch {
      feedback.textContent = 'That did not work. Try again.';
    } finally {
      addBtn.disabled = false;
      render();
    }
  });

  render();
  void handle;
}
