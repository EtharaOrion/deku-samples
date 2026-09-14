import { createSignal, createResource, Show, For, Suspense } from 'solid-js';
import { formatUsd, api } from './lib.js';

// The cart: lines edited in place, quantities optimistic in the interface and
// authoritative on the server, a protection toggle, and a summary.
export default function CartView(props) {
  const [cart, setCart] = createSignal(props.cart);
  const [busyLine, setBusyLine] = createSignal(null);
  const [error, setError] = createSignal('');
  const [pending, setPending] = createSignal(false);
  const [flash, setFlash] = createSignal('');

  const refresh = async () => {
    try {
      const next = await api('/api/cart');
      setCart(next);
    } catch (err) {
      setError(err.message);
    }
  };

  const setQuantity = async (line, quantity) => {
    if (quantity < 1 || quantity > 10) return;
    const before = cart();
    // Optimistic: the number moves at once, the totals show a pending state.
    setCart({
      ...before,
      lines: before.lines.map((l) => (l.id === line.id ? { ...l, quantity } : l))
    });
    setPending(true);
    setBusyLine(line.id);
    setError('');
    try {
      const next = await api(`/api/cart/lines/${line.id}`, { method: 'PATCH', body: { quantity } });
      setCart(next);
    } catch (err) {
      setCart(before); // a rejection reverts the number and states the reason
      setError(err.message);
    } finally {
      setPending(false);
      setBusyLine(null);
    }
  };

  const remove = async (line) => {
    const before = cart();
    setCart({ ...before, lines: before.lines.filter((l) => l.id !== line.id) });
    try {
      const next = await api(`/api/cart/lines/${line.id}`, { method: 'DELETE' });
      setCart(next);
    } catch (err) {
      setCart(before);
      setError(err.message);
    }
  };

  const toggleProtection = async (event) => {
    const enabled = event.currentTarget.checked;
    const before = cart();
    setCart({ ...before, protection: { ...before.protection, enabled } });
    try {
      const next = await api('/api/cart/protection', { method: 'POST', body: { enabled } });
      setCart(next);
    } catch (err) {
      setCart(before);
      setError(err.message);
    }
  };

  const view = () => cart() || { lines: [], notices: [], protection: {} };
  const subtotal = () => view().subtotal_minor || 0;
  const protectionPrice = () => (view().protection?.enabled ? view().protection.price_minor || 0 : 0);
  const shipping = () => view().shipping_minor;
  const tax = () => view().tax_minor;
  const total = () => view().total_minor;

  return (
    <div class="cart-layout">
      <div>
        <Show when={view().notices?.length}>
          <div class="notice wrong" role="status">
            <strong>Take another look before you check out.</strong>
            <For each={view().notices}>{(n) => <p>{n.message}</p>}</For>
          </div>
        </Show>

        <Show when={error()}>
          <div class="notice wrong" role="alert">{error()}</div>
        </Show>

        <Show
          when={view().lines?.length}
          fallback={
            <div class="empty">
              <p>Your cart is empty.</p>
              <p><a href="/shop">Browse the catalogue</a></p>
            </div>
          }
        >
          <ul class="cart-lines">
            <For each={view().lines}>
              {(line) => (
                <li class="cart-line card">
                  <div class="line-media" aria-hidden="true" data-kind={line.product_kind} />
                  <div class="line-main">
                    <h3>
                      <a href={`/shop/${line.product_handle}`}>{line.title}</a>
                    </h3>
                    <p class="line-meta">
                      {line.option_value} · <span class="mono">{line.sku}</span>
                    </p>
                    <p class="line-price tnum">{formatUsd(line.unit_price_minor)} each</p>
                  </div>
                  <div class="line-stepper">
                    <button
                      type="button"
                      class="btn secondary"
                      aria-label={`Decrease quantity of ${line.title}`}
                      onClick={() => setQuantity(line, Math.max(1, line.quantity - 1))}
                      disabled={line.quantity <= 1 || busyLine() === line.id}
                    >
                      −
                    </button>
                    <span class="quantity tnum" aria-live="polite">{line.quantity}</span>
                    <button
                      type="button"
                      class="btn secondary"
                      aria-label={`Increase quantity of ${line.title}`}
                      onClick={() => setQuantity(line, Math.min(10, line.quantity + 1))}
                      disabled={line.quantity >= 10 || busyLine() === line.id}
                    >
                      +
                    </button>
                  </div>
                  <p class="line-total tnum price">
                    <Show when={!pending() || busyLine() !== line.id} fallback={<span class="pending">…</span>}>
                      {formatUsd(line.unit_price_minor * line.quantity)}
                    </Show>
                  </p>
                  <button
                    type="button"
                    class="btn quiet"
                    onClick={() => remove(line)}
                    aria-label={`Remove ${line.title} from the cart`}
                  >
                    Remove
                  </button>
                </li>
              )}
            </For>
          </ul>

          <Show when={view().protection?.rung}>
            <div class="protection card">
              <label class="protection-label">
                <input
                  type="checkbox"
                  checked={!!view().protection.enabled}
                  onChange={toggleProtection}
                />
                <span>
                  Protect this shipment against loss, theft and damage for{' '}
                  {formatUsd(view().protection.rung.price_minor)}
                </span>
              </label>
            </div>
          </Show>
        </Show>
      </div>

      <aside class="summary card" aria-label="Order summary">
        <h2 class="section-title">Summary</h2>
        <dl class="totals">
          <div>
            <dt>Subtotal</dt>
            <dd class="tnum">{formatUsd(subtotal())}</dd>
          </div>
          <Show when={protectionPrice() > 0}>
            <div>
              <dt>Shipment protection</dt>
              <dd class="tnum">{formatUsd(protectionPrice())}</dd>
            </div>
          </Show>
          <div>
            <dt>Estimated delivery</dt>
            <dd class="tnum">
              <Show when={shipping() !== null && shipping() !== undefined} fallback={<span>Estimated</span>}>
                {formatUsd(shipping())}
              </Show>
            </dd>
          </div>
          <div>
            <dt>Estimated tax</dt>
            <dd class="tnum">
              <Show when={tax() !== null && tax() !== undefined} fallback={<span>Estimated</span>}>
                {formatUsd(tax())}
              </Show>
            </dd>
          </div>
          <div class="grand">
            <dt>Total</dt>
            <dd class="tnum">
              <Show when={total() !== null && total() !== undefined} fallback={<span>Estimated</span>}>
                {formatUsd(total())}
              </Show>
            </dd>
          </div>
        </dl>
        <p class="estimate-note">
          Estimated. We will show the exact amount once we know where it is going.
        </p>
        <Show when={view().lines?.length}>
          <a class="btn" href="/checkout/where-it-goes">Check out</a>
        </Show>
      </aside>
    </div>
  );
}
