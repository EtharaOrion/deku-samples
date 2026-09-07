import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatMoney } from '../lib/money.js';

/**
 * The buy control for one product: option choice, quantity and add to cart.
 *
 * Choosing an option updates the address with a `variant` parameter by
 * replacing history rather than pushing it, so the back control leaves the
 * product page instead of walking option changes.
 */
export default function BuyBox({ product, initialSku }) {
  const variants = product.variants || [];
  const [sku, setSku] = useState(() => {
    const found = variants.find((v) => v.sku === initialSku);
    return (found ?? variants[0])?.sku ?? '';
  });
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState(null);

  const variant = useMemo(() => variants.find((v) => v.sku === sku) ?? variants[0], [sku, variants]);
  const discontinued = product.status === 'discontinued';
  const available = variant?.available ?? 0;
  const soldOut = available <= 0;
  const buyable = !discontinued && !soldOut;

  // A quantity stepper from one to the lesser of ten and available stock.
  const maxQty = Math.max(1, Math.min(10, available));

  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), maxQty));
  }, [maxQty]);

  useEffect(() => {
    if (!variant) return;
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.sku);
    // Replacing history rather than pushing it.
    window.history.replaceState({}, '', url);
  }, [variant?.sku]);

  async function addToCart() {
    if (!buyable || state === 'working') return;
    setState('working');
    setMessage(null);
    try {
      const res = await fetch('/api/cart/lines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sku: variant.sku, quantity }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setState('idle');
        setMessage({ tone: 'error', text: body?.message || 'That did not work.' });
        return;
      }
      setState('done');
      // Success is stated in words before it is coloured.
      setMessage({ tone: 'done', text: 'Added to your cart.' });
      window.dispatchEvent(new CustomEvent('vela:cart', { detail: body.cart }));
      setTimeout(() => setState('idle'), 1200);
    } catch {
      setState('idle');
      setMessage({ tone: 'error', text: 'That did not work.' });
    }
  }

  // Availability is a state, not a boolean.
  let availabilityLine = null;
  if (discontinued) availabilityLine = null;
  else if (soldOut) availabilityLine = null;
  else if (available <= 10) availabilityLine = `Only ${available} left`;

  return (
    <div class="buybox">
      <p class="buybox__price money strong">{formatMoney(variant?.price_minor ?? 0)}</p>

      {variants.length > 1 && (
        // One radio group per option rather than a select when there are five
        // or fewer choices.
        <fieldset class="buybox__options">
          <legend class="field__label">Colour</legend>
          {variants.map((v) => (
            <label class="option" key={v.sku}>
              <input
                type="radio"
                name="variant"
                value={v.sku}
                checked={v.sku === sku}
                onChange={() => setSku(v.sku)}
              />
              <span>{v.option_value}</span>
              {v.available <= 0 && <span class="chip chip--neutral">Sold out</span>}
            </label>
          ))}
        </fieldset>
      )}

      <div class="buybox__qty">
        <label class="field__label" for="qty">
          Quantity
        </label>
        <div class="stepper">
          <button
            type="button"
            class="btn btn--secondary btn--small"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || !buyable}
            aria-label="One fewer"
          >
            <span aria-hidden="true">−</span>
          </button>
          <input
            id="qty"
            class="input stepper__input num"
            type="number"
            min="1"
            max={maxQty}
            value={quantity}
            disabled={!buyable}
            onInput={(e) => {
              const n = parseInt(e.currentTarget.value, 10);
              setQuantity(Number.isNaN(n) ? 1 : Math.min(Math.max(1, n), maxQty));
            }}
          />
          <button
            type="button"
            class="btn btn--secondary btn--small"
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            disabled={quantity >= maxQty || !buyable}
            aria-label="One more"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>

      {availabilityLine && <p class="buybox__avail small">{availabilityLine}</p>}

      <button
        type="button"
        class="btn buybox__buy"
        onClick={addToCart}
        disabled={!buyable}
        aria-describedby={!buyable ? 'buy-reason' : undefined}
      >
        {discontinued
          ? 'We no longer sell this'
          : soldOut
            ? 'Sold out'
            : state === 'working'
              ? 'Adding'
              : 'Add to cart'}
      </button>

      {/* An unavailable control always says why. */}
      {!buyable && (
        <p id="buy-reason" class="small muted buybox__reason">
          {discontinued
            ? 'This product is discontinued.'
            : 'This option is sold out. Choose another colour if one is available.'}
        </p>
      )}

      <p class="live-region small" role="status" aria-live="polite">
        {message ? message.text : ''}
      </p>

      <style>{`
        .buybox__price { font-size: 24px; line-height: 30px; margin: 0 0 calc(var(--unit) * 4); }
        .buybox__options { border: 0; padding: 0; margin: 0 0 calc(var(--unit) * 4); }
        .option {
          display: flex; align-items: center; gap: calc(var(--unit) * 2);
          padding: calc(var(--unit) * 2) calc(var(--unit) * 3);
          border: var(--border-w) solid var(--line-strong);
          border-radius: var(--radius);
          margin-bottom: calc(var(--unit) * 2);
          cursor: pointer;
          transition: border-color var(--speed) var(--ease);
        }
        .option:has(input:checked) { border-color: var(--fg); border-width: 2px; }
        .buybox__qty { margin-bottom: calc(var(--unit) * 4); }
        .stepper { display: flex; align-items: center; gap: calc(var(--unit) * 2); }
        .stepper__input { width: 5rem; text-align: center; }
        .buybox__avail { margin: 0 0 calc(var(--unit) * 3); color: var(--progress); }
        .buybox__buy { width: 100%; }
        .buybox__reason { margin-top: calc(var(--unit) * 2); }
        .live-region { min-height: 21px; margin: calc(var(--unit) * 2) 0 0; }
      `}</style>
    </div>
  );
}
