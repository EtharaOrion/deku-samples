import { useState } from 'preact/hooks';

const money = (minor) => {
  const n = Math.trunc(Number(minor));
  const whole = Math.trunc(Math.abs(n) / 100);
  const cents = Math.abs(n) % 100;
  return `${n < 0 ? '-' : ''}$${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${String(cents).padStart(2, '0')}`;
};

// Quantities are optimistic in the interface and authoritative on the server:
// the number moves at once, the totals show a pending state, and a rejection
// reverts the number and states the reason.
export default function CartEditor({ cart: initial }) {
  const [cart, setCart] = useState(initial);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [failure, setFailure] = useState('');

  const apply = async (fn, optimisticPatch) => {
    setFailure('');
    if (optimisticPatch) setOptimistic(optimisticPatch);
    setPending(true);
    try {
      const res = await fn();
      const body = await res.json();
      if (!res.ok) {
        setOptimistic({});
        setFailure(body.message || 'That did not work.');
        return;
      }
      setCart(body);
      setOptimistic({});
      syncBadge(body.item_count);
    } catch {
      setOptimistic({});
      setFailure('That did not work. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  const syncBadge = (count) => {
    const control = document.querySelector('.cart-control');
    if (!control) return;
    const n = Number(count || 0);
    control.setAttribute('aria-label', `Cart, ${n} ${n === 1 ? 'item' : 'items'}`);
    const badge = control.querySelector('.cart-badge');
    if (n === 0) { if (badge) badge.remove(); return; }
    if (badge) badge.textContent = n > 99 ? '99+' : String(n);
  };

  const setQuantity = (line, quantity) =>
    apply(
      () => fetch(`/api/cart/lines/${line.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quantity }),
      }),
      { [line.id]: quantity },
    );

  const remove = (line) =>
    apply(() => fetch(`/api/cart/lines/${line.id}`, { method: 'DELETE' }));

  const setProtection = (enabled) =>
    apply(() => fetch('/api/cart/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    }));

  if (!cart.lines.length) {
    return (
      <div class="empty">
        <p>Your cart is empty.</p>
        <p><a href="/shop">Go to the shop</a></p>
      </div>
    );
  }

  return (
    <div class="cart-layout">
      <div>
        {/* A price or availability change renders above the lines as a
            persistent notice that cannot be dismissed. */}
        {cart.notices.length > 0 && (
          <div class="cart-notices">
            {cart.notices.map((n) => (
              <p class="notice notice-progress" role="status">{n.message}</p>
            ))}
          </div>
        )}

        {failure && <p class="notice notice-wrong" role="alert">{failure}</p>}

        <ul class="cart-lines">
          {cart.lines.map((line) => {
            const qty = optimistic[line.id] ?? line.quantity;
            return (
              <li class="cart-line">
                <div class="cart-thumb" aria-hidden="true" data-kind={line.kind}></div>
                <div class="cart-line-body">
                  <h3 class="cart-line-title">
                    <a href={`/shop/${line.handle}?variant=${encodeURIComponent(line.sku)}`}>{line.title}</a>
                  </h3>
                  <p class="cart-line-variant">{line.option_value} · <span class="mono">{line.sku}</span></p>
                  <p class="cart-line-unit tabular">{money(line.unit_price_minor)} each</p>
                </div>
                <div class="cart-line-qty">
                  <label class="visually-hidden" for={`qty-${line.id}`}>Quantity of {line.title}</label>
                  <div class="stepper" role="group">
                    <button
                      type="button"
                      class="button button-quiet button-small"
                      onClick={() => setQuantity(line, qty - 1)}
                      disabled={qty <= 1}
                    >
                      <span aria-hidden="true">−</span><span class="visually-hidden">One fewer</span>
                    </button>
                    <output class="stepper-value tabular" id={`qty-${line.id}`}>{qty}</output>
                    <button
                      type="button"
                      class="button button-quiet button-small"
                      onClick={() => setQuantity(line, qty + 1)}
                      disabled={qty >= Math.min(10, line.available)}
                    >
                      <span aria-hidden="true">+</span><span class="visually-hidden">One more</span>
                    </button>
                  </div>
                </div>
                <div class="cart-line-total tabular">{money(line.unit_price_minor * qty)}</div>
                <div class="cart-line-remove">
                  <button type="button" class="button button-quiet button-small" onClick={() => remove(line)}>
                    Remove<span class="visually-hidden"> {line.title} from the cart</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <aside class="cart-summary card" aria-label="Cart summary" data-pending={pending ? 'true' : 'false'}>
        <h2 class="section-title">Summary</h2>

        {cart.protection_rung && (
          <label class="check protection">
            <input
              type="checkbox"
              checked={cart.protection_enabled}
              onChange={(e) => setProtection(e.currentTarget.checked)}
            />
            <span>Protect this shipment against loss, theft and damage for {money(cart.protection_rung.price_minor)}</span>
          </label>
        )}

        <dl class="totals">
          <div><dt>Estimated subtotal</dt><dd class="tabular">{money(cart.subtotal_minor)}</dd></div>
          {cart.protection_minor > 0 && (
            <div><dt>Shipment protection</dt><dd class="tabular">{money(cart.protection_minor)}</dd></div>
          )}
          <div><dt>Estimated delivery</dt><dd class="tabular">{money(cart.shipping_minor)}</dd></div>
          <div><dt>Estimated tax</dt><dd class="tabular">{money(cart.tax_minor)}</dd></div>
          <div class="totals-total"><dt>Estimated total</dt><dd class="tabular">{money(cart.total_minor)}</dd></div>
        </dl>

        <p class="totals-note">Estimated. We will show the exact amount once we know where it is going.</p>

        <p class="pending-line" aria-live="polite">{pending ? 'Updating your cart' : ''}</p>

        <a class="button cart-checkout" href="/checkout/where-it-goes">Check out</a>
      </aside>
    </div>
  );
}
