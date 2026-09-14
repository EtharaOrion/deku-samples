import { useState } from 'preact/hooks';

const fmt = (m) => { const abs = Math.abs(m || 0); return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`; };

export default function CheckoutPay({ cart, ready }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const place = async () => {
    setBusy(true); setErr(null);
    try {
      let key = sessionStorage.getItem('vela_idempotency_key');
      if (!key) { key = crypto.randomUUID(); sessionStorage.setItem('vela_idempotency_key', key); }
      const res = await fetch('/api/orders', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error?.message || 'That did not work.');
        if (body?.error?.code === 'cart_reprice') setTimeout(() => { window.location.href = '/cart'; }, 1200);
        return;
      }
      sessionStorage.removeItem('vela_idempotency_key');
      window.dispatchEvent(new CustomEvent('vela-cart'));
      const token = body.access_token ? `?access_token=${encodeURIComponent(body.access_token)}` : '';
      window.location.href = `/orders/${body.number}${token}`;
    } catch {
      setErr('That did not work.');
    } finally { setBusy(false); }
  };

  if (!ready) {
    return (
      <div class="checkout">
        <ol class="steps" aria-label="Checkout steps">
          <li>Where it goes</li>
          <li>How it gets there</li>
          <li aria-current="step">Payment</li>
        </ol>
        <div class="card">
          <h1>Payment</h1>
          <p>Finish the first two steps and the total will be waiting here.</p>
          <a class="btn" href="/checkout/where-it-goes">Go to step one</a>
        </div>
      </div>
    );
  }

  return (
    <div class="checkout">
      <ol class="steps" aria-label="Checkout steps">
        <li>Where it goes</li>
        <li>How it gets there</li>
        <li aria-current="step">Payment</li>
      </ol>
      <div class="step-form">
        <h1>Payment</h1>
        <p class="muted">This shop takes no card. The order is invoiced to {cart.email}.</p>
        <button class="btn btn-primary" onClick={place} disabled={busy}>{busy ? 'Placing your order' : `Place the order`}</button>
        {busy ? <p class="muted" role="status">Placing your order.</p> : null}
        {err ? <p class="error-text" role="alert">{err} <a href="/cart">Back to the cart</a></p> : null}
      </div>
      <aside class="summary card" aria-label="Order summary">
        <h2>Order total</h2>
        <table class="spec">
          <tbody>
            {cart.lines.map((l, i) => (
              <tr key={i}><th scope="row">{l.title} <span class="muted small">{l.variant_title}</span> x{l.quantity}</th><td class="num tnum">{fmt(l.line_total_minor)}</td></tr>
            ))}
            {cart.protection_minor ? <tr><th scope="row">Shipment protection</th><td class="num tnum">{fmt(cart.protection_minor)}</td></tr> : null}
            <tr><th scope="row">Delivery ({cart.shipping_method})</th><td class="num tnum">{fmt(cart.shipping_minor)}</td></tr>
            <tr><th scope="row">Tax</th><td class="num tnum">{fmt(cart.tax_minor)}</td></tr>
            <tr><th scope="row">Total</th><td class="num tnum"><strong>{fmt(cart.total_minor)}</strong></td></tr>
          </tbody>
        </table>
      </aside>
    </div>
  );
}
