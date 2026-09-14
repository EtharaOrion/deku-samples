/** Checkout step forms. Values survive back navigation because they live in the cart. */
export function mountStepForm(form) {
  if (!form) return;
  const error = form.querySelector('[data-step-error]');
  const next = form.dataset.next;
  const isMethodStep = form.dataset.methodStep !== undefined;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const fd = new FormData(form);

    if (isMethodStep) {
      const method = fd.get('shipping_method');
      if (!method) {
        error.textContent = 'Choose a delivery method.';
        return;
      }
      try {
        const res = await fetch('/api/cart/delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shipping_method: method }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error?.message || 'That did not work.');
      } catch (err) {
        error.textContent = err.message;
        return;
      }
      window.location.href = next;
      return;
    }

    const address = {
      name: String(fd.get('name') || '').trim(),
      line1: String(fd.get('line1') || '').trim(),
      line2: String(fd.get('line2') || '').trim(),
      city: String(fd.get('city') || '').trim(),
      region: String(fd.get('region') || '').trim(),
      postal_code: String(fd.get('postal_code') || '').trim(),
      country: String(fd.get('country') || '').trim(),
      phone: String(fd.get('phone') || '').trim(),
    };
    const email = String(fd.get('email') || '').trim();
    if (!email) { error.textContent = 'Email is required.'; return; }
    for (const [key, label] of [['name', 'Name'], ['line1', 'Address'], ['city', 'City'], ['postal_code', 'Postal code'], ['country', 'Country']]) {
      if (!address[key]) { error.textContent = `${label} is required.`; return; }
    }

    try {
      const res = await fetch('/api/cart/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, shipping_address: address }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'That did not work.');
      window.location.href = next;
    } catch (err) {
      error.textContent = err.message;
    }
  });
}

export function mountPlaceForm(form) {
  if (!form) return;
  const error = form.querySelector('[data-step-error]');
  const button = form.querySelector('[data-place]');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'Placing your order';

    // One idempotency key per browser placement attempt.
    if (!sessionStorage.getItem('vela_order_key')) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      sessionStorage.setItem('vela_order_key', Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
    }
    const key = sessionStorage.getItem('vela_order_key');

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'That did not work.');
      sessionStorage.removeItem('vela_order_key');
      window.location.href = `/orders/${body.number}?access_token=${encodeURIComponent(body.access_token)}`;
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
      button.textContent = 'Place order';
    }
  });
}
