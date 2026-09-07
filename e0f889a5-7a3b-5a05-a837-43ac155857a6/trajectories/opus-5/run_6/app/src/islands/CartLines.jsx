import { useEffect, useState } from 'preact/hooks';
import { formatMinor } from '../lib/money.js';

// Quantities are optimistic in the interface and authoritative on the server:
// the number moves at once, the totals show a pending state, and a rejection
// reverts the number and states the reason.
export default function CartLines({ initial }) {
  const [cart, setCart] = useState(initial);
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState({});
  const [problem, setProblem] = useState('');

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vela:cart', { detail: cart }));
  }, [cart]);

  const call = async (url, options, revert) => {
    setPending(true);
    setProblem('');
    try {
      const res = await fetch(url, { credentials: 'same-origin', ...options });
      const body = await res.json();
      if (!res.ok) {
        setOptimistic({});
        setProblem(body.message || 'That did not work.');
        if (revert) revert();
        return;
      }
      setCart(body);
      setOptimistic({});
    } catch {
      setOptimistic({});
      setProblem('That did not work. Check your connection and try again.');
      if (revert) revert();
    } finally {
      setPending(false);
    }
  };

  const setQuantity = (line, quantity) => {
    if (quantity < 1 || quantity > 10) return;
    setOptimistic((o) => ({ ...o, [line.id]: quantity }));
    call(`/api/cart/lines/${line.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    });
  };

  const remove = (line) => {
    if (!window.confirm(`Remove ${line.title} from your cart?`)) return;
    call(`/api/cart/lines/${line.id}`, { method: 'DELETE' });
  };

  const toggleProtection = (enabled) => {
    call('/api/cart/protection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  };

  const goods = cart.lines.filter((l) => l.kind !== 'protection');

  if (!goods.length) {
    return (
      <div class="empty">
        <p>Your cart is empty.</p>
        <p style="margin-top:calc(var(--unit) * 3)">
          <a href="/shop">Go to the shop</a>.
        </p>
      </div>
    );
  }

  return (
    <div class="cart-layout">
      <div>
        {/* A price or availability change is a persistent notice that cannot be dismissed. */}
        {cart.notices.map((n) => (
          <p class="notice wrong" key={n.sku} role="status" data-test="cart-notice">
            {n.message}
          </p>
        ))}
        {problem ? (
          <p class="notice wrong" role="alert">
            {problem}
          </p>
        ) : null}

        <table data-test="cart-lines">
          <caption class="visually-hidden">Your cart</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" class="num">
                Unit price
              </th>
              <th scope="col">Quantity</th>
              <th scope="col" class="num">
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
              const total = line.unit_price_minor * qty;
              return (
                <tr key={line.id} data-sku={line.sku}>
                  <td>
                    <div class="row" style="gap:calc(var(--unit) * 3);flex-wrap:nowrap">
                      <span class="cart-thumb" aria-hidden="true" />
                      <span>
                        <strong>{line.product_title}</strong>
                        <br />
                        <span class="hint">{line.kind === 'protection' ? 'Loss, theft and damage' : line.option_value}</span>
                        <br />
                        <span class="hint mono">{line.sku}</span>
                      </span>
                    </div>
                  </td>
                  <td class="num tnum">{formatMinor(line.unit_price_minor)}</td>
                  <td>
                    {line.kind === 'protection' ? (
                      <span class="tnum">1</span>
                    ) : (
                      <span class="row" style="gap:calc(var(--unit) * 2);flex-wrap:nowrap">
                        <button
                          type="button"
                          class="btn quiet"
                          aria-label={`One fewer ${line.title}`}
                          disabled={qty <= 1}
                          onClick={() => setQuantity(line, qty - 1)}
                        >
                          −
                        </button>
                        <output class="tnum" data-test={`qty-${line.sku}`}>
                          {qty}
                        </output>
                        <button
                          type="button"
                          class="btn quiet"
                          aria-label={`One more ${line.title}`}
                          disabled={qty >= 10}
                          onClick={() => setQuantity(line, qty + 1)}
                        >
                          +
                        </button>
                      </span>
                    )}
                  </td>
                  <td class="num tnum" data-pending={pending ? 'true' : 'false'}>
                    {formatMinor(total)}
                  </td>
                  <td class="num">
                    {line.removable ? (
                      <button type="button" class="btn quiet" onClick={() => remove(line)}>
                        Remove
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <aside class="card summary" aria-label="Cart summary">
        <h2 style="font-size:16px;line-height:24px;margin-bottom:calc(var(--unit) * 3)">Summary</h2>
        <dl class="totals">
          <div>
            <dt>{cart.estimated ? 'Estimated subtotal' : 'Subtotal'}</dt>
            <dd class="tnum" data-test="subtotal">
              {formatMinor(cart.subtotal_minor)}
            </dd>
          </div>
          <div>
            <dt>{cart.estimated ? 'Estimated delivery' : 'Delivery'}</dt>
            <dd class="tnum">{formatMinor(cart.shipping_minor)}</dd>
          </div>
          <div>
            <dt>{cart.estimated ? 'Estimated tax' : 'Tax'}</dt>
            <dd class="tnum" data-test="tax">
              {formatMinor(cart.tax_minor)}
            </dd>
          </div>
          <div class="total-row">
            <dt>Total</dt>
            <dd class="tnum" data-test="total" data-pending={pending ? 'true' : 'false'}>
              {formatMinor(cart.total_minor)}
            </dd>
          </div>
        </dl>

        {cart.estimated ? (
          <p class="hint" style="margin-top:calc(var(--unit) * 3)">
            Estimated. We will show the exact amount once we know where it is going.
          </p>
        ) : null}

        <label class="protection">
          <input
            type="checkbox"
            checked={cart.protection_enabled}
            onChange={(e) => toggleProtection(e.currentTarget.checked)}
            data-test="protection"
          />
          <span>
            Protect this shipment against loss, theft and damage for {formatMinor(cart.protection_rung.price_minor)}
          </span>
        </label>

        <a class="btn" href="/checkout/where-it-goes" style="width:100%;margin-top:calc(var(--unit) * 4)" data-test="checkout">
          Check out
        </a>
        <p class="hint" style="margin-top:calc(var(--unit) * 2)">
          {pending ? 'Updating your cart.' : 'Prices in US dollars.'}
        </p>
      </aside>

      <style>{`
        .cart-layout { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,320px); gap: calc(var(--unit) * 8); align-items: start; }
        .cart-thumb { display:block; width: 56px; height: 42px; background: var(--ground-sunken); border-radius: 0; flex: 0 0 auto; }
        .totals { margin: 0; }
        .totals > div { display: flex; justify-content: space-between; gap: calc(var(--unit) * 3); padding: calc(var(--unit) * 1) 0; }
        .totals dt, .totals dd { margin: 0; font-size: 14px; line-height: 21px; }
        .total-row { border-top: 1px solid var(--rule); margin-top: calc(var(--unit) * 2); padding-top: calc(var(--unit) * 2); font-weight: 700; }
        .total-row dt, .total-row dd { font-size: 16px; line-height: 24px; font-weight: 700; }
        [data-pending='true'] { opacity: 0.55; }
        .protection { display: flex; gap: calc(var(--unit) * 2); align-items: flex-start; margin-top: calc(var(--unit) * 4); font-size: 14px; line-height: 21px; }
        .protection input { width: auto; min-height: 0; margin-top: 3px; }
        @media (max-width: 63.999rem) { .cart-layout { grid-template-columns: minmax(0,1fr); } }
      `}</style>
    </div>
  );
}
