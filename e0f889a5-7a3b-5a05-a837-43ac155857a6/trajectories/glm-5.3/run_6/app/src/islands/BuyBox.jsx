import { createSignal, Show, For } from 'solid-js';
import { formatUsd, api } from './lib.js';

// The buy control on one product page: one radio group per option, a quantity
// stepper bounded by stock, and one primary control.
export default function BuyBox(props) {
  const variants = () => props.variants || [];
  const initial = () =>
    variants().find((v) => v.sku === props.selectedSku) ||
    variants().find((v) => v.available > 0) ||
    variants()[0];

  const [selected, setSelected] = createSignal(initial()?.sku || null);
  const [quantity, setQuantity] = createSignal(1);
  const [state, setState] = createSignal('idle');
  const [message, setMessage] = createSignal('');

  const current = () => variants().find((v) => v.sku === selected()) || null;
  const maxQuantity = () => Math.min(10, current()?.available || 0);

  const availability = () => {
    if (props.productStatus === 'discontinued') {
      return { state: 'discontinued', label: 'Discontinued', buyable: false };
    }
    const v = current();
    if (!v || v.available <= 0) return { state: 'sold_out', label: 'Sold out', buyable: false };
    return {
      state: 'available',
      label: v.available <= 10 ? `Only ${v.available} left` : 'Available',
      buyable: true
    };
  };

  const choose = (sku) => {
    setSelected(sku);
    setQuantity(1);
    setMessage('');
    // Choosing an option updates the address by replacing history, so the back
    // control leaves the product page rather than walking option changes.
    const url = new URL(window.location.href);
    url.searchParams.set('variant', sku);
    window.history.replaceState({}, '', url);
  };

  const add = async () => {
    setState('adding');
    setMessage('');
    try {
      await api('/api/cart/lines', { method: 'POST', body: { sku: selected(), quantity: quantity() } });
      setState('added');
      window.dispatchEvent(new CustomEvent('vela:cart-changed', { detail: { count: quantity() } }));
      setMessage(`Added to the cart.`);
      setTimeout(() => setState('idle'), 1600);
    } catch (err) {
      setState('error');
      setMessage(err.message);
    }
  };

  return (
    <div class="buybox">
      <p class="availability" data-state={availability().state}>
        <span
          class="dot"
          aria-hidden="true"
          data-state={availability().state}
          style={{
            background:
              availability().state === 'available' ? 'var(--finished)' : 'var(--line)'
          }}
        />
        <span>{availability().label}</span>
      </p>

      <Show when={variants().length > 1}>
        <fieldset class="field option-group">
          <legend>{props.optionName || 'Option'}</legend>
          <div class="options" role="radiogroup" aria-label={props.optionName || 'Option'}>
            <For each={variants()}>
              {(v) => (
                <label class={'option' + (selected() === v.sku ? ' is-selected' : '')}>
                  <input
                    type="radio"
                    name="variant"
                    value={v.sku}
                    checked={selected() === v.sku}
                    onChange={() => choose(v.sku)}
                    disabled={v.available <= 0}
                  />
                  <span class="option-label">{v.option_value}</span>
                  <Show when={v.available <= 0}>
                    <span class="option-state">Sold out</span>
                  </Show>
                </label>
              )}
            </For>
          </div>
        </fieldset>
      </Show>

      <div class="field">
        <label for="quantity">Quantity</label>
        <div class="stepper">
          <button
            type="button"
            class="btn secondary"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity() <= 1}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <input
            id="quantity"
            class="quantity-input tnum"
            type="number"
            inputmode="numeric"
            min="1"
            max={maxQuantity() || 1}
            value={quantity()}
            onInput={(e) => {
              const next = Number(e.currentTarget.value);
              if (Number.isInteger(next) && next >= 1 && next <= (maxQuantity() || 1)) setQuantity(next);
            }}
          />
          <button
            type="button"
            class="btn secondary"
            onClick={() => setQuantity((q) => Math.min(maxQuantity() || 1, q + 1))}
            disabled={quantity() >= (maxQuantity() || 1)}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <button
        type="button"
        class="btn"
        onClick={add}
        disabled={!availability().buyable || state() === 'adding'}
      >
        <Show when={props.productStatus === 'discontinued'} fallback={<span>Add to cart</span>}>
          <span>Sold out</span>
        </Show>
      </button>

      <Show when={message()}>
        <p class="buy-message" role="status">
          {message()}
        </p>
      </Show>
      <Show when={state() === 'added'}>
        <p>
          <a class="btn secondary" href="/cart">Go to the cart</a>
        </p>
      </Show>
    </div>
  );
}
