import { createSignal, Show, For } from 'solid-js';
import { formatUsd, api } from './lib.js';

// Checkout step three: the final total and one control to place the order.
export default function PlaceOrder(props) {
  const cart = () => props.cart || {};
  const [state, setState] = createSignal('idle');
  const [failure, setFailure] = createSignal('');
  const [notices, setNotices] = createSignal([]);
  const [idempotencyKey] = createSignal(props.idempotencyKey || '');

  const total = () => cart().total_minor;

  const place = async () => {
    if (state() === 'placing') return;
    setState('placing');
    setFailure('');
    setNotices([]);
    const key = idempotencyKey() || `order-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const order = await api('/api/orders', {
        method: 'POST',
        body: { expected_total_minor: total() },
        token: undefined
      });
      window.localStorage.setItem('vela_last_order', JSON.stringify(order));
      window.location.href = `/orders/${order.number}?access_token=${encodeURIComponent(order.access_token)}`;
    } catch (err) {
      setState('idle');
      if (err.code === 'price_changed' || err.code === 'total_changed') {
        setNotices(err.payload?.error?.notices || []);
        setFailure(err.message);
      } else {
        setFailure(err.message);
      }
    }
  };

  return (
    <div>
      <Show when={failure()}>
        <div class="notice wrong" role="alert">
          <p>{failure()}</p>
          <Show when={notices().length}>
            <For each={notices()}>{(n) => <p>{n.message}</p>}</For>
          </Show>
          <p><a href="/cart">Return to the cart</a></p>
        </div>
      </Show>

      <div class="card place-card">
        <h2 class="section-title">Payment</h2>
        <p>
          There is no card. The order is invoiced to{' '}
          <span class="mono">{cart().email}</span> and paid against the invoice.
        </p>
        <dl class="totals">
          <div><dt>Subtotal</dt><dd class="tnum">{formatUsd(cart().subtotal_minor)}</dd></div>
          <Show when={cart().protection?.enabled && cart().protection?.price_minor}>
            <div><dt>Shipment protection</dt><dd class="tnum">{formatUsd(cart().protection.price_minor)}</dd></div>
          </Show>
          <div><dt>Delivery</dt><dd class="tnum">{formatUsd(cart().shipping_minor)}</dd></div>
          <div><dt>Tax</dt><dd class="tnum">{formatUsd(cart().tax_minor)}</dd></div>
          <div class="grand"><dt>Total</dt><dd class="tnum">{formatUsd(total())}</dd></div>
        </dl>
        <button class="btn" type="button" onClick={place} disabled={state() === 'placing'}>
          {state() === 'placing' ? 'Placing your order' : 'Place the order'}
        </button>
        <p class="hint">
          The amount charged is the figure shown here. If anything changes first, we send you back to the cart.
        </p>
      </div>
      <p><a class="btn secondary" href="/checkout/how-it-gets-there">Back</a></p>
    </div>
  );
}
