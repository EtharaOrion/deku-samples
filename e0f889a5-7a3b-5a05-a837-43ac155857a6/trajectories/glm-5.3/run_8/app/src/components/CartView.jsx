import { useEffect, useState } from 'preact/hooks';

const fmt = (m) => { const abs = Math.abs(Math.trunc(m || 0)); const sign = (m || 0) < 0 ? '-' : ''; return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`; };

export default function CartView({ initialCart }) {
  const [cart, setCart] = useState(initialCart);
  const [pending, setPending] = useState(null); // {lineId, qty}
  const [lineErr, setLineErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cart', { credentials: 'same-origin' });
      if (res.ok) setCart(await res.json());
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const setQty = async (line, qty) => {
    // Optimistic in the interface, authoritative on the server.
    const before = cart;
    setPending({ lineId: line.id, qty });
    setLineErr(null);
    setCart({
      ...cart,
      lines: cart.lines.map((l) => (l.id === line.id ? { ...l, quantity: qty, line_total_minor: qty * l.current_price_minor } : l)),
      subtotal_minor: cart.lines.reduce((s, l) => s + (l.id === line.id ? qty * l.current_price_minor : l.line_total_minor), 0),
    });
    try {
      const res = await fetch(`/api/cart/lines/${line.id}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: qty }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setCart(before); setLineErr(body?.error?.message || 'That did not work.'); return; }
      setCart(body);
    } catch {
      setCart(before); setLineErr('That did not work.');
    } finally {
      setPending(null);
    }
  };

  const removeLine = async (line) => {
    if (!window.confirm(`Remove ${line.title} from your cart?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/cart/lines/${line.id}`, { method: 'DELETE', credentials: 'same-origin' });
      if (res.ok) setCart(await res.json());
    } finally { setBusy(false); }
  };

  const setProtection = async (enabled) => {
    setCart({ ...cart, protection: { ...cart.protection, enabled } });
    const res = await fetch('/api/cart/protection', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) setCart(await res.json()); else refresh();
  };

  if (!cart || cart.lines.length === 0) {
    return (
      <div>
        <h1>Cart</h1>
        <div class="card empty" data-loading>
          <p>Your cart is empty.</p>
          <a class="btn" href="/shop">Go to the shop</a>
        </div>
      </div>
    );
  }

  const subtotal = cart.subtotal_minor;
  const protection = cart.protection || {};
  const protectionMinor = protection.enabled && protection.rung ? protection.rung.price_minor : 0;
  const shipping = cart.shipping_minor || 0;
  const tax = cart.tax_minor;
  const total = cart.total_minor != null ? cart.total_minor : subtotal + protectionMinor + shipping + (tax || 0);

  return (
    <div>
      <h1>Cart</h1>
      {(cart.notices || []).map((n) => (
        <p class="notice" role="status">{n.message}</p>
      ))}
      <table class="cart-table">
        <caption class="sr-only">Cart lines</caption>
        <thead>
          <tr><th scope="col">Item</th><th scope="col">Unit</th><th scope="col">Quantity</th><th scope="col" class="num">Line total</th><th scope="col"><span class="sr-only">Remove</span></th></tr>
        </thead>
        <tbody>
          {cart.lines.map((l) => (
            <tr class={pending && pending.lineId === l.id ? 'pending' : ''}>
              <td>
                <div class="line-title">
                  <div class="thumb" aria-hidden="true"></div>
                  <div>
                    <a href={`/shop/${l.handle}`}>{l.title}</a>
                    <div class="muted small">{l.variant_title}</div>
                    <div class="muted small mono">{l.sku}</div>
                  </div>
                </div>
              </td>
              <td class="tnum">{fmt(l.current_price_minor)}</td>
              <td>
                <div class="stepper">
                  <button class="btn" aria-label={`Decrease quantity of ${l.title}`} disabled={l.quantity <= 1 || busy}
                    onClick={() => setQty(l, Math.max(1, l.quantity - 1))}>−</button>
                  <span class="tnum qty-read" aria-live="polite">{l.quantity}</span>
                  <button class="btn" aria-label={`Increase quantity of ${l.title}`} disabled={l.quantity >= 10 || busy}
                    onClick={() => setQty(l, Math.min(10, l.quantity + 1))}>+</button>
                </div>
              </td>
              <td class="num tnum">{fmt(l.line_total_minor)}</td>
              <td>
                <button class="btn btn-quiet" onClick={() => removeLine(l)}>Remove<span class="sr-only"> {l.title}</span></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lineErr ? <p class="error-text" role="alert">{lineErr}</p> : null}
      {pending ? <p class="muted small" role="status">Updating your cart.</p> : null}

      <div class="cart-foot">
        <div class="summary card">
          <h2>Summary</h2>
          <dl class="dl">
            <dt>Subtotal</dt><dd class="tnum">{fmt(subtotal)}</dd>
            {protectionMinor ? (<><dt>Shipment protection</dt><dd class="tnum">{fmt(protectionMinor)}</dd></>) : null}
            <dt>Estimated delivery</dt><dd class="tnum">{shipping ? fmt(shipping) : '—'}</dd>
            <dt>Estimated tax</dt><dd class="tnum">{tax != null ? fmt(tax) : '—'}</dd>
            <dt>Total</dt><dd class="tnum"><strong>{fmt(total)}</strong></dd>
          </dl>
          {cart.estimated !== false ? (
            <p class="muted small">Estimated. We will show the exact amount once we know where it is going.</p>
          ) : null}
          <a class="btn btn-primary" href="/checkout/where-it-goes">Check out</a>
        </div>
        <div class="extras">
          {protection.rung ? (
            <label class="protect card">
              <input type="checkbox" checked={!!protection.enabled} onChange={(e) => setProtection(e.target.checked)} />
              <span>Protect this shipment against loss, theft and damage for {fmt(protection.rung.price_minor)}</span>
            </label>
          ) : (
            <p class="muted small">Shipment protection is available once the cart holds something.</p>
          )}
        </div>
      </div>
    </div>
  );
}
