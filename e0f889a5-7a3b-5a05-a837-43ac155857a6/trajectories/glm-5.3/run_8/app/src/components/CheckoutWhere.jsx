import { useState } from 'preact/hooks';

const fmt = (m) => { const abs = Math.abs(m || 0); return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`; };

export default function CheckoutWhere({ initial, subtotalMinor }) {
  const [f, setF] = useState(initial);
  const [marketing, setMarketing] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/cart/delivery', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: f.email,
          shipping_address: {
            name: f.name, line1: f.line1, line2: f.line2, city: f.city,
            region: f.region, postal_code: f.postal_code, country: f.country, phone: f.phone,
          },
          marketing_opt_in: marketing,
          shipping_method: 'Standard',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.error?.message || 'That did not work.'); return; }
      window.location.href = '/checkout/how-it-gets-there';
    } catch {
      setErr('That did not work.');
    } finally { setBusy(false); }
  };

  return (
    <div class="checkout">
      <ol class="steps" aria-label="Checkout steps">
        <li aria-current="step">Where it goes</li>
        <li>How it gets there</li>
        <li>Payment</li>
      </ol>
      <form class="step-form" onSubmit={submit} novalidate>
        <h1>Where it goes</h1>
        <div class="field"><label for="email">Email</label>
          <input id="email" type="email" required value={f.email} onInput={set('email')} autocomplete="email" /></div>
        <label class="checkrow"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
          <span>Send me news about firmware. Unticked by default.</span></label>
        <div class="field"><label for="name">Name</label>
          <input id="name" required value={f.name} onInput={set('name')} autocomplete="name" /></div>
        <div class="field"><label for="line1">Address line 1</label>
          <input id="line1" required value={f.line1} onInput={set('line1')} autocomplete="address-line1" /></div>
        <div class="field"><label for="line2">Address line 2 <span class="muted">(optional)</span></label>
          <input id="line2" value={f.line2} onInput={set('line2')} autocomplete="address-line2" /></div>
        <div class="row3">
          <div class="field"><label for="city">City</label>
            <input id="city" required value={f.city} onInput={set('city')} autocomplete="address-level2" /></div>
          <div class="field"><label for="region">Region</label>
            <input id="region" value={f.region} onInput={set('region')} autocomplete="address-level1" /></div>
          <div class="field"><label for="postal">Postal code</label>
            <input id="postal" required value={f.postal_code} onInput={set('postal_code')} autocomplete="postal-code" /></div>
        </div>
        <div class="field"><label for="country">Country</label>
          <select id="country" value={f.country} onChange={set('country')}>
            <option value="US">United States</option>
          </select></div>
        <div class="field"><label for="phone">Phone <span class="muted">(optional)</span></label>
          <input id="phone" type="tel" value={f.phone} onInput={set('phone')} autocomplete="tel" /></div>
        {err ? <p class="error-text" role="alert">{err}</p> : null}
        <button class="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving' : 'Continue to delivery'}</button>
      </form>
      <aside class="summary card" aria-label="Order summary">
        <h2>Summary</h2>
        <dl class="dl">
          <dt>Subtotal</dt><dd class="tnum">{fmt(subtotalMinor)}</dd>
          <dt>Delivery</dt><dd>Chosen next</dd>
          <dt>Tax</dt><dd>Shown next</dd>
        </dl>
        <p class="muted small">Estimated. We will show the exact amount once we know where it is going.</p>
      </aside>
    </div>
  );
}
