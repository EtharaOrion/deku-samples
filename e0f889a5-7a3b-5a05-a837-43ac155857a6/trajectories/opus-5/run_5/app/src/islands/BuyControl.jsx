import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatMinor } from '../lib/format.js';

/**
 * One radio group per option rather than a select when there are five or fewer
 * choices, a quantity stepper from one to the lesser of ten and available stock,
 * and one primary buy control.
 */
export default function BuyControl({ product, initialSku }) {
  const variants = product.variants ?? [];
  const [sku, setSku] = useState(
    variants.some((v) => v.sku === initialSku) ? initialSku : variants[0]?.sku,
  );
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');

  const variant = useMemo(
    () => variants.find((v) => v.sku === sku) ?? variants[0],
    [sku, variants],
  );

  const discontinued = product.status === 'discontinued';
  const soldOut = variant ? variant.availability.state === 'sold_out' : true;
  const purchasable = Boolean(variant?.availability?.purchasable) && !discontinued;
  const cap = Math.max(1, Math.min(10, variant?.available ?? 0));

  useEffect(() => {
    if (quantity > cap) setQuantity(cap);
  }, [cap, quantity]);

  useEffect(() => {
    if (!variant) return;
    // Choosing an option updates the address by replacing history rather than
    // pushing it, so the back control leaves the product page instead of
    // walking option changes.
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.sku);
    window.history.replaceState({}, '', url);
  }, [variant]);

  async function addToCart(event) {
    event.preventDefault();
    if (!purchasable || state === 'working') return;
    setState('working');
    setMessage('');
    try {
      const res = await fetch('/api/cart/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: variant.sku, quantity }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState('error');
        setMessage(body.message || 'That did not work.');
        return;
      }
      setState('done');
      setMessage('Added to your cart.');
      window.dispatchEvent(new CustomEvent('vela:cart', { detail: body }));
    } catch {
      setState('error');
      setMessage('That did not work.');
    }
  }

  if (!variant) return null;

  const optionName = 'Colour';
  const useRadios = variants.length <= 5;

  return (
    <form class="stack" onSubmit={addToCart}>
      <div>
        <p class="money" style="font-size:20px;line-height:28px;font-weight:700">
          {formatMinor(variant.price_minor)}
        </p>
        {/* Availability is a state, not a boolean. */}
        <p style="margin-top:0.25rem" data-availability={variant.availability.state}>
          {discontinued && <span class="chip">No longer sold</span>}
          {!discontinued && soldOut && <span class="chip chip--wrong">Sold out</span>}
          {!discontinued && variant.availability.state === 'low' && (
            <span class="chip chip--progress">Only {variant.available} left</span>
          )}
          {!discontinued && variant.availability.state === 'available' && (
            <span class="chip chip--done">In stock</span>
          )}
        </p>
      </div>

      {variants.length > 1 && (
        useRadios ? (
          <fieldset style="border:0;padding:0;margin:0">
            <legend style="padding:0;margin-bottom:0.5rem">{optionName}</legend>
            <div class="row">
              {variants.map((v) => (
                <label
                  key={v.sku}
                  class="button button--quiet"
                  style={v.sku === variant.sku ? 'font-weight:700;background:var(--inset)' : ''}
                >
                  <input
                    type="radio"
                    name="variant"
                    value={v.sku}
                    checked={v.sku === variant.sku}
                    onChange={() => setSku(v.sku)}
                    style="margin-right:0.5rem"
                  />
                  {v.option_value}
                  {v.availability.state === 'sold_out' && (
                    <span style="margin-left:0.5rem;color:var(--quiet)">Sold out</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div class="field">
            <label for="variant-select">{optionName}</label>
            <select
              id="variant-select"
              class="input"
              value={variant.sku}
              onChange={(e) => setSku(e.currentTarget.value)}
            >
              {variants.map((v) => (
                <option key={v.sku} value={v.sku}>{v.option_value}</option>
              ))}
            </select>
          </div>
        )
      )}

      <div class="row">
        <div class="field">
          <label for="quantity">Quantity</label>
          <div class="row" style="gap:0.25rem">
            <button
              type="button"
              class="button button--quiet"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={!purchasable || quantity <= 1}
              aria-label="One fewer"
            >−</button>
            <input
              id="quantity"
              class="input tnum"
              style="width:4.5rem;text-align:center"
              type="number"
              inputmode="numeric"
              min="1"
              max={cap}
              value={quantity}
              disabled={!purchasable}
              onInput={(e) => {
                const n = Number(e.currentTarget.value);
                setQuantity(Number.isFinite(n) ? Math.min(cap, Math.max(1, Math.trunc(n))) : 1);
              }}
            />
            <button
              type="button"
              class="button button--quiet"
              onClick={() => setQuantity((q) => Math.min(cap, q + 1))}
              disabled={!purchasable || quantity >= cap}
              aria-label="One more"
            >+</button>
          </div>
        </div>
      </div>

      <div>
        <button
          class="button button--primary"
          type="submit"
          disabled={!purchasable || state === 'working'}
          aria-disabled={!purchasable || state === 'working'}
        >
          {discontinued
            ? 'No longer sold'
            : soldOut
              ? 'Sold out'
              : state === 'working'
                ? 'Adding'
                : 'Add to cart'}
        </button>
        {/* An unavailable control always says why. */}
        {!purchasable && (
          <p style="margin-top:0.5rem;color:var(--quiet)">
            {discontinued
              ? 'We no longer sell this.'
              : 'This option is sold out. Choose another or come back later.'}
          </p>
        )}
      </div>

      {/* Success is stated in words before it is coloured. */}
      <p role="status" aria-live="polite" style="min-height:1.5rem">
        {message && (
          <span class={state === 'error' ? 'chip chip--wrong' : 'chip chip--done'}>{message}</span>
        )}
        {state === 'done' && <a href="/cart" style="margin-left:0.5rem">Go to cart</a>}
      </p>
    </form>
  );
}
