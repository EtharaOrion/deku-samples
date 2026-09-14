import { useState } from 'preact/hooks';

const fmt = (m) => { const abs = Math.abs(m || 0); return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`; };

export default function CheckoutHow({ delivery = [], selectedMethod = '', subtotalMinor = 0, addressKnown = false, email = '' }) {
  const [chosen, setChosen] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!chosen) { setErr('Choose a delivery method.'); return; }
    setErr(null); setBusy(true);
    try {
      const cartRes = await fetch('/api/cart', { credentials: 'same-origin' });
      const cart = await cartRes.json();
      const res = await fetch('/api/cart/delivery', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cart.email || email,
          shipping_address: cart.shipping_address,
          shipping_method: chosen,
          marketing_opt_in: false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.error?.message || 'That did not work.'); return; }
      window.location.href = '/checkout/payment';
    } catch {
      setErr('That did not work.');
    } finally { setBusy(false); }
  };

  return (
    <div class="checkout">
      <ol class="steps" aria-label="Checkout steps">
        <li>Where it goes</li>
        <li aria-current="step">How it gets there</li>
        <li>Payment</li>
      </ol>
      <form class="step-form" onSubmit={submit}>
        <h1>How it gets there</h1>
        {!addressKnown ? <p class="notice">Tell us where it goes first. <a href="/checkout/where-it-goes">Go back to step one</a>.</p> : null}
        <fieldset>
          <legend>Delivery method</legend>
          <div class="options" role="radiogroup" aria-label="Delivery method">
            {delivery.map((m) => (
              <label class={`option${chosen === m.title ? ' chosen' : ''}`}>
                <input type="radio" name="method" value={m.title} checked={chosen === m.title} onChange={() => setChosen(m.title)} />
                <span>{m.title}</span>
                <span class="muted small">{m.min_days === m.max_days ? `${m.max_days} days` : `${m.min_days} to ${m.max_days} days`}</span>
                <span class="tnum price-inline">{m.price_minor === 0 ? 'Free' : fmt(m.price_minor)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p class="muted small">No method is preselected. Pick one.</p>
        {err ? <p class="error-text" role="alert">{err}</p> : null}
        <button class="btn btn-primary" type="submit" disabled={busy || !addressKnown}>{busy ? 'Saving' : 'Continue to payment'}</button>
      </form>
      <aside class="summary card" aria-label="Order summary">
        <h2>Summary</h2>
        <dl class="dl">
          <dt>Subtotal</dt><dd class="tnum">{fmt(subtotalMinor)}</dd>
          <dt>Delivery</dt><dd>{chosen ? (delivery.find((m) => m.title === chosen)?.price_minor === 0 ? 'Free' : fmt(delivery.find((m) => m.title === chosen).price_minor)) : '—'}</dd>
          <dt>Tax</dt><dd>Shown next</dd>
        </dl>
      </aside>
    </div>
  );
}
