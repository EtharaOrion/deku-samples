import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatMinor } from '../lib/format.js';

/**
 * The option radios, the quantity stepper and the buy control.
 *
 * Choosing an option updates the address with a `variant` parameter by
 * replacing history rather than pushing it, so the back control leaves the
 * product page instead of walking option changes.
 */
export default function BuyControls({ product, initialSku }) {
  const variants = product.variants;
  const [sku, setSku] = useState(() => {
    const found = variants.find((v) => v.sku === initialSku);
    return found ? found.sku : variants[0]?.sku;
  });
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState(null);

  const variant = useMemo(() => variants.find((v) => v.sku === sku) || variants[0], [sku, variants]);
  const discontinued = product.status === 'discontinued';
  const available = Number(variant?.available || 0);
  const soldOut = available <= 0;
  const purchasable = !discontinued && !soldOut;
  // A quantity stepper from one to the lesser of ten and available stock.
  const maxQty = Math.max(1, Math.min(10, available));

  useEffect(() => {
    if (!variant) return;
    const url = new URL(window.location.href);
    if (variants.length > 1) {
      url.searchParams.set('variant', variant.sku);
    } else {
      url.searchParams.delete('variant');
    }
    // Replace rather than push.
    window.history.replaceState({}, '', url);
  }, [variant?.sku]);

  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty]);

  async function addToCart() {
    if (!purchasable || state === 'working') return;
    setState('working');
    setMessage(null);
    try {
      const res = await fetch('/api/cart/lines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ sku: variant.sku, quantity }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(body.message || 'That did not work.');
        return;
      }
      setState('done');
      // Success is stated in words before it is coloured.
      setMessage('Added to your cart.');
      window.dispatchEvent(new CustomEvent('vela:cart-changed', { detail: body }));
    } catch {
      setState('error');
      setMessage('That did not work. Check your connection and try again.');
    }
  }

  if (!variant) return null;

  // Availability is a state, not a boolean.
  let availabilityLine = null;
  if (discontinued) availabilityLine = 'Discontinued';
  else if (soldOut) availabilityLine = 'Sold out';
  else if (available <= 10) availabilityLine = `Only ${available} left`;

  return (
    <div class="buy">
      <p class="price money tnum">{formatMinor(variant.price_minor, variant.currency)}</p>

      {availabilityLine && (
        <p class={`availability${soldOut || discontinued ? ' danger' : ''}`}>{availabilityLine}</p>
      )}

      {/* One radio group per option rather than a select when there are five or
          fewer choices. */}
      {variants.length > 1 && (
        <fieldset class="options">
          <legend>Colour</legend>
          <div class="option-row">
            {variants.map((v) => {
              const out = Number(v.available) <= 0;
              return (
                <label class={`option${v.sku === variant.sku ? ' selected' : ''}`} key={v.sku}>
                  <input
                    type="radio"
                    name="variant"
                    value={v.sku}
                    checked={v.sku === variant.sku}
                    onChange={() => setSku(v.sku)}
                  />
                  <span>{v.option_value}</span>
                  {/* Colour never carries meaning alone. */}
                  {out && <span class="option-note">Sold out</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div class="qty">
        <span id="qty-label">Quantity</span>
        <div class="stepper" role="group" aria-labelledby="qty-label">
          <button
            type="button"
            class="step"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || !purchasable}
          >
            <span aria-hidden="true">−</span>
            <span class="visually-hidden">One fewer</span>
          </button>
          <output class="qty-value tnum" aria-live="polite">{quantity}</output>
          <button
            type="button"
            class="step"
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            disabled={quantity >= maxQty || !purchasable}
          >
            <span aria-hidden="true">+</span>
            <span class="visually-hidden">One more</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-primary buy-control"
        onClick={addToCart}
        disabled={!purchasable || state === 'working'}
      >
        {discontinued ? 'Discontinued'
          : soldOut ? 'Sold out'
          : state === 'working' ? 'Adding' : 'Add to cart'}
      </button>

      {/* An unavailable control always says why. */}
      {!purchasable && (
        <p class="hint">
          {discontinued
            ? 'We no longer sell this.'
            : 'We have none of this one left.'}
        </p>
      )}

      <p class="live" role="status" aria-live="polite">
        {message && (
          <span class={state === 'error' ? 'error-text' : undefined}>
            {message}
            {state === 'done' && <> <a href="/cart">Go to your cart</a></>}
          </span>
        )}
      </p>

      <style>{`
        .buy { display: flex; flex-direction: column; gap: calc(var(--space) * 4); }
        .price { font-size: 24px; line-height: 30px; font-weight: 700; }
        .availability { font-size: 14px; color: var(--fg-muted); }
        .availability.danger { color: var(--danger); }

        .options { border: 0; padding: 0; margin: 0; }
        .options legend { font-weight: 700; font-size: 14px; padding: 0 0 calc(var(--space) * 2); }
        .option-row { display: flex; flex-wrap: wrap; gap: calc(var(--space) * 2); }
        .option {
          display: inline-flex; align-items: center; gap: calc(var(--space) * 2);
          border: var(--border-w) solid var(--rule-strong);
          border-radius: var(--radius);
          padding: calc(var(--space) * 2) calc(var(--space) * 3);
          cursor: pointer;
        }
        .option.selected { border-color: var(--fg); font-weight: 700; }
        .option-note { font-size: 12px; color: var(--fg-muted); }

        .qty { display: flex; align-items: center; gap: calc(var(--space) * 3); font-size: 14px; }
        .stepper { display: inline-flex; align-items: center; border: var(--border-w) solid var(--rule-strong); border-radius: var(--radius); }
        .step {
          width: 36px; height: 36px; border: 0; background: transparent; cursor: pointer;
          transition: background-color var(--speed) var(--ease);
        }
        .step:hover:not(:disabled) { background: var(--bg-sunken); }
        .step:disabled { opacity: 0.4; cursor: not-allowed; }
        .qty-value { min-width: 36px; text-align: center; font-variant-numeric: tabular-nums; }

        .buy-control { align-self: flex-start; min-width: 200px; }
        .live { min-height: 21px; font-size: 14px; }
      `}</style>
    </div>
  );
}
