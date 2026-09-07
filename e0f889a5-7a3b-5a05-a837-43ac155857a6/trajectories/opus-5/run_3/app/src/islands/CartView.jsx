import { useEffect, useState } from 'preact/hooks';
import { formatMoney } from '../lib/money.js';

/**
 * The cart, edited in place.
 *
 * Quantities are optimistic in the interface and authoritative on the server:
 * the number moves at once, the totals show a pending state, and a rejection
 * reverts the number and states the reason.
 */
export default function CartView({ initialCart }) {
  const [cart, setCart] = useState(initialCart);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    const onCart = (ev) => setCart(ev.detail);
    window.addEventListener('vela:cart', onCart);
    return () => window.removeEventListener('vela:cart', onCart);
  }, []);

  async function send(path, init) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(path, init);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // A rejection reverts the number and states the reason.
        setOptimistic({});
        setError(body?.message || 'That did not work.');
        return null;
      }
      setCart(body.cart);
      setOptimistic({});
      return body.cart;
    } catch {
      setOptimistic({});
      setError('That did not work.');
      return null;
    } finally {
      setPending(false);
    }
  }

  function setQuantity(line, quantity) {
    if (quantity < 1 || quantity > 10) return;
    setOptimistic((o) => ({ ...o, [line.id]: quantity }));
    send(`/api/cart/lines/${line.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
  }

  function remove(line) {
    send(`/api/cart/lines/${line.id}`, { method: 'DELETE' });
  }

  function toggleProtection(enabled) {
    send('/api/cart/protection', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <div class="empty">
        <p>Your cart is empty.</p>
        <p>
          <a href="/shop">Shop</a>
        </p>
      </div>
    );
  }

  const rung = cart.protection_rung;

  return (
    <div class="cartview">
      {/* A price or availability change renders above the lines as a persistent
          notice that cannot be dismissed. */}
      {cart.notices.map((notice) => (
        <div class="notice notice--warn" key={notice.sku} role="status">
          <span class="notice__body">{notice.message}</span>
        </div>
      ))}

      {error && (
        <div class="notice notice--error" role="alert">
          <span class="notice__body">{error}</span>
        </div>
      )}

      <div class="cartview__grid">
        <div>
          <table class="table cart-table">
            <caption class="visually-hidden">Items in your cart</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" class="right">
                  Unit
                </th>
                <th scope="col">Quantity</th>
                <th scope="col" class="right">
                  Line total
                </th>
                <th scope="col">
                  <span class="visually-hidden">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cart.lines.map((line) => {
                const qty = optimistic[line.id] ?? line.quantity;
                return (
                  <tr key={line.id}>
                    <td>
                      <div class="cart-line">
                        <img
                          class="cart-line__thumb"
                          src={`/media/products/${line.handle}.svg`}
                          alt=""
                          width="72"
                          height="60"
                        />
                        <div>
                          <a class="cart-line__title" href={`/shop/${line.handle}`}>
                            {line.title}
                          </a>
                          <p class="small muted cart-line__variant">{line.option_value}</p>
                        </div>
                      </div>
                    </td>
                    <td class="right money">{formatMoney(line.unit_price_minor)}</td>
                    <td>
                      <div class="stepper">
                        <button
                          type="button"
                          class="btn btn--secondary btn--small"
                          onClick={() => setQuantity(line, qty - 1)}
                          disabled={qty <= 1}
                          aria-label={`One fewer ${line.title}`}
                        >
                          <span aria-hidden="true">−</span>
                        </button>
                        <span class="num stepper__value" aria-live="off">
                          {qty}
                        </span>
                        <button
                          type="button"
                          class="btn btn--secondary btn--small"
                          onClick={() => setQuantity(line, qty + 1)}
                          disabled={qty >= Math.min(10, line.available)}
                          aria-label={`One more ${line.title}`}
                        >
                          <span aria-hidden="true">+</span>
                        </button>
                      </div>
                    </td>
                    <td class="right money">{formatMoney(line.unit_price_minor * qty)}</td>
                    <td class="right">
                      <button
                        type="button"
                        class="btn btn--quiet btn--small"
                        onClick={() => remove(line)}
                      >
                        Remove
                        <span class="visually-hidden"> {line.title}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <aside class="panel cart-summary" aria-label="Summary">
          <h2 class="section-title">Summary</h2>

          <dl class={`totals ${pending ? 'is-pending' : ''}`}>
            <div class="totals__row">
              <dt>Subtotal</dt>
              <dd class="money">{formatMoney(cart.subtotal_minor)}</dd>
            </div>
            <div class="totals__row">
              <dt>Estimated delivery</dt>
              <dd class="money">{formatMoney(cart.shipping_minor)}</dd>
            </div>
            <div class="totals__row">
              <dt>Estimated tax</dt>
              <dd class="money">{formatMoney(cart.tax_minor)}</dd>
            </div>
            <div class="totals__row totals__row--total">
              <dt>Total</dt>
              <dd class="money strong">{formatMoney(cart.total_minor)}</dd>
            </div>
          </dl>

          <p class="small muted">
            Estimated. We will show the exact amount once we know where it is going.
          </p>

          {rung && (
            <label class="checkbox-row protect">
              <input
                type="checkbox"
                checked={rung.enabled}
                onChange={(e) => toggleProtection(e.currentTarget.checked)}
              />
              <span>
                Protect this shipment against loss, theft and damage for{' '}
                <span class="money">{formatMoney(rung.price_minor)}</span>
              </span>
            </label>
          )}

          <a class="btn cart-summary__go" href="/checkout/where-it-goes">
            Check out
          </a>
        </aside>
      </div>

      <style>{`
        .cartview__grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: calc(var(--unit) * 6);
          align-items: start;
        }
        .cart-line { display: flex; gap: calc(var(--unit) * 3); align-items: center; }
        .cart-line__thumb { border-radius: 0; border: var(--border-w) solid var(--line); }
        .cart-line__title { font-weight: 700; text-decoration: none; }
        .cart-line__variant { margin: calc(var(--unit) * 0.5) 0 0; }
        .stepper { display: flex; align-items: center; gap: calc(var(--unit) * 2); }
        .stepper__value { min-width: 2ch; text-align: center; }
        .totals { margin: 0 0 calc(var(--unit) * 3); }
        .totals__row { display: flex; justify-content: space-between; gap: calc(var(--unit) * 3); padding: calc(var(--unit) * 1) 0; }
        .totals__row dt, .totals__row dd { margin: 0; }
        .totals__row--total { border-top: var(--border-w) solid var(--line); margin-top: calc(var(--unit) * 2); padding-top: calc(var(--unit) * 2); }
        /* The totals show a pending state while the server is authoritative. */
        .totals.is-pending { opacity: 0.55; }
        .cart-summary__go { width: 100%; margin-top: calc(var(--unit) * 4); }
        .protect { margin-top: calc(var(--unit) * 4); }
        @media (max-width: 63.999rem) {
          .cartview__grid { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
    </div>
  );
}
