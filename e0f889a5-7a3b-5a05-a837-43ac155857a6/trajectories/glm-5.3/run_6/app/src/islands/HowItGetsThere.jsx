import { createSignal, Show, For } from 'solid-js';
import { formatUsd, api } from './lib.js';

// Checkout step two: how it gets there. Standard and Express with prices and
// windows, and neither preselected.
export default function HowItGetsThere(props) {
  const methods = () => props.cart?.shipping_methods || [];
  const [choice, setChoice] = createSignal(props.cart?.shipping_method || '');
  const [saving, setSaving] = createSignal(false);
  const [failure, setFailure] = createSignal('');
  const [cart, setCart] = createSignal(props.cart);

  const choose = async (code) => {
    setChoice(code);
    setSaving(true);
    setFailure('');
    try {
      const next = await api('/api/cart/delivery', {
        method: 'POST',
        body: { shipping_method: code }
      });
      setCart(next);
    } catch (err) {
      setFailure(err.message);
      setChoice('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Show when={failure()}>
        <div class="notice wrong" role="alert">{failure()}</div>
      </Show>

      <Show
        when={methods().length}
        fallback={
          <div class="notice">
            <p>We ship to the United States only. Go back and check the country.</p>
          </div>
        }
      >
        <fieldset class="field">
          <legend>Delivery method</legend>
          <div class="options" role="radiogroup" aria-label="Delivery method">
            <For each={methods()}>
              {(method) => (
                <label class={'option' + (choice() === method.code ? ' is-selected' : '')}>
                  <input
                    type="radio"
                    name="shipping_method"
                    value={method.code}
                    checked={choice() === method.code}
                    onChange={() => choose(method.code)}
                    disabled={saving()}
                  />
                  <span class="option-label">
                    <strong>{method.name}</strong>
                    <span class="hint">Arrives in {method.windowText}</span>
                  </span>
                  <span class="option-price tnum">
                    {method.priceMinor === 0 ? 'Free' : formatUsd(method.priceMinor)}
                  </span>
                </label>
              )}
            </For>
          </div>
        </fieldset>
      </Show>

      <div class="actions">
        <a class="btn secondary" href="/checkout/where-it-goes">Back</a>
        <a
          class="btn"
          href="/checkout/payment"
          aria-disabled={!choice()}
          classList={{ 'is-blocked': !choice() }}
          onClick={(event) => {
            if (!choice()) {
              event.preventDefault();
              setFailure('Choose a delivery method.');
            }
          }}
        >
          Continue to payment
        </a>
      </div>
      <Show when={!choice()}>
        <p class="hint">Choose a delivery method to continue.</p>
      </Show>
    </div>
  );
}
