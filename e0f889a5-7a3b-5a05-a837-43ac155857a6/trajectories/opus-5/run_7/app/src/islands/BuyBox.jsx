import { useState, useEffect } from 'preact/hooks';
import { api, formatMinor, publishCartCount, announce } from '../lib/client.js';

/**
 * Options, the quantity stepper and the buy control. Choosing an option updates
 * the address with a `variant` parameter by replacing history rather than pushing
 * it, so the back control leaves the product page instead of walking option changes.
 */
export default function BuyBox({ product, initialSku }) {
  const variants = product.variants || [];
  const [sku, setSku] = useState(initialSku || variants[0]?.sku);
  const [qty, setQty] = useState(1);
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  const variant = variants.find((v) => v.sku === sku) || variants[0];
  const discontinued = product.status === 'discontinued';
  const available = variant?.available ?? 0;
  const soldOut = !discontinued && available <= 0;
  const maxQty = Math.max(1, Math.min(10, available));

  useEffect(() => {
    if (!variant) return;
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.sku);
    window.history.replaceState({}, '', url);
  }, [sku]);

  useEffect(() => {
    if (qty > maxQty) setQty(maxQty);
  }, [maxQty]);

  const add = async () => {
    if (discontinued || soldOut) return;
    setState('adding');
    setError(null);
    try {
      const d = await api('/cart/lines', { method: 'POST', body: { sku: variant.sku, quantity: qty } });
      publishCartCount(d.cart.item_count);
      setState('added');
      announce(`${product.title} added to your cart.`);
      setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      setState('idle');
      setError(err.message);
      announce(err.message);
    }
  };

  // Availability is a state, not a boolean.
  let availability;
  if (discontinued) availability = { text: 'Discontinued', tone: 'chip' };
  else if (soldOut) availability = { text: 'Sold out', tone: 'chip chip-danger' };
  else if (available <= 10) availability = { text: `Only ${available} left`, tone: 'chip' };
  else availability = { text: 'Available', tone: 'chip' };

  let buyLabel = 'Add to cart';
  let reason = null;
  if (discontinued) { buyLabel = 'No longer sold'; reason = 'We no longer sell this.'; }
  else if (soldOut) { buyLabel = 'Sold out'; reason = 'This option is sold out.'; }
  else if (state === 'adding') buyLabel = 'Adding';
  else if (state === 'added') buyLabel = 'Added to cart';

  return (
    <div>
      <p class="money" style="font-size:24px;font-weight:700;margin-bottom:calc(var(--unit) * 2)">
        {formatMinor(variant?.price_minor ?? product.price_minor)}
      </p>

      <p style="margin-bottom:calc(var(--unit) * 4)">
        <span class={availability.tone}>{availability.text}</span>
      </p>

      {/* A radio group rather than a select when there are five or fewer choices. */}
      {variants.length > 1 && variants.length <= 5 && (
        <fieldset style="border:0;padding:0;margin:0 0 calc(var(--unit) * 5)">
          <legend class="label" style="font-weight:700;font-size:14px;padding:0;margin-bottom:calc(var(--unit)*2)">
            Finish
          </legend>
          <div class="row" style="gap:calc(var(--unit) * 2)">
            {variants.map((v) => {
              const out = product.status !== 'discontinued' && v.available <= 0;
              return (
                <label
                  key={v.sku}
                  class="card"
                  style={`padding:calc(var(--unit)*2) calc(var(--unit)*3);cursor:pointer;box-shadow:none;${
                    v.sku === sku ? 'border-color:var(--fg);border-width:2px' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={v.sku}
                    checked={v.sku === sku}
                    onChange={() => setSku(v.sku)}
                    style="margin-inline-end:calc(var(--unit)*2)"
                  />
                  <span style={v.sku === sku ? 'font-weight:700' : ''}>{v.option_value}</span>
                  {out && <span class="small muted"> — sold out</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {variants.length > 5 && (
        <label class="field">
          <span class="label">Finish</span>
          <select class="input" value={sku} onChange={(e) => setSku(e.currentTarget.value)}>
            {variants.map((v) => <option value={v.sku} key={v.sku}>{v.option_value}</option>)}
          </select>
        </label>
      )}

      {/* A quantity stepper from one to the lesser of ten and available stock. */}
      {!discontinued && !soldOut && (
        <div class="field">
          <span class="label" id="qty-label">Quantity</span>
          <div class="row" style="gap:calc(var(--unit) * 2)">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label="One fewer"
            >−</button>
            <output class="tnum" aria-live="polite" style="min-width:3ch;text-align:center;font-weight:700">{qty}</output>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              disabled={qty >= maxQty}
              aria-label="One more"
            >+</button>
            <span class="small muted">{maxQty === 10 ? 'Up to 10 per order' : `Up to ${maxQty} available`}</span>
          </div>
        </div>
      )}

      <button
        type="button"
        class="btn"
        onClick={add}
        disabled={discontinued || soldOut || state === 'adding'}
        aria-describedby={reason ? 'buy-reason' : undefined}
        style="width:100%"
      >
        {buyLabel}
      </button>

      {/* An unavailable control always says why. */}
      {reason && <p class="small muted" id="buy-reason" style="margin-top:calc(var(--unit)*2)">{reason}</p>}

      {state === 'added' && (
        <p class="small" style="margin-top:calc(var(--unit)*2);color:var(--done)">
          Added to your cart. <a href="/cart">Go to the cart</a>.
        </p>
      )}

      {error && (
        <p class="field-error" role="alert" style="margin-top:calc(var(--unit)*2)">{error}</p>
      )}
    </div>
  );
}
