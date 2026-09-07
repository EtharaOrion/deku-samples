import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatMinor } from '../lib/money.js';

// The buy control: one radio group per option, a stepper, one primary control.
// Choosing an option replaces history rather than pushing it, so the back control
// leaves the product page instead of walking option changes.
export default function BuyPanel({ product, initialSku, variantKnown }) {
  const variants = product.variants;
  const [sku, setSku] = useState(initialSku || (variants[0] && variants[0].sku));
  const [qty, setQty] = useState(1);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');

  const variant = useMemo(() => variants.find((v) => v.sku === sku) || variants[0], [sku, variants]);
  const discontinued = product.status === 'discontinued';
  const soldOut = !discontinued && variant.available <= 0;
  const max = Math.min(10, Math.max(variant.available, 0));

  useEffect(() => {
    const url = new URL(window.location.href);
    if (variantKnown === false && url.searchParams.has('variant')) {
      // A parameter naming a variant that does not exist drops without comment.
      url.searchParams.delete('variant');
      window.history.replaceState({}, '', url.toString());
    }
  }, [variantKnown]);

  useEffect(() => {
    if (qty > Math.max(max, 1)) setQty(Math.max(1, max));
  }, [max]);

  const choose = (nextSku) => {
    setSku(nextSku);
    setMessage('');
    setState('idle');
    const url = new URL(window.location.href);
    url.searchParams.set('variant', nextSku);
    window.history.replaceState({}, '', url.toString());
  };

  const add = async () => {
    setState('working');
    setMessage('');
    try {
      const res = await fetch('/api/cart/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ sku: variant.sku, quantity: qty }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState('wrong');
        setMessage(body.message || 'That did not work.');
        return;
      }
      setState('done');
      setMessage('Added to your cart.');
      window.dispatchEvent(new CustomEvent('vela:cart', { detail: body }));
    } catch {
      setState('wrong');
      setMessage('That did not work. Check your connection and try again.');
    }
  };

  const availabilityLine = discontinued
    ? 'We no longer sell this.'
    : soldOut
      ? 'Sold out'
      : variant.available <= 10
        ? `Only ${variant.available} left`
        : 'Available';

  return (
    <div class="stack" style="gap:calc(var(--unit) * 4)">
      <p class="price" style="font-size:24px;line-height:30px;font-weight:700;margin:0">
        {formatMinor(variant.price_minor)}
      </p>

      <p class="hint" data-test="availability">
        {availabilityLine}
      </p>

      {variants.length > 1 && variants.length <= 5 ? (
        <fieldset class="options">
          <legend class="rail-label">Finish</legend>
          <div class="row" style="gap:calc(var(--unit) * 2)">
            {variants.map((v) => (
              <label class="option" key={v.sku} data-selected={v.sku === variant.sku ? 'true' : 'false'}>
                <input
                  type="radio"
                  name="variant"
                  value={v.sku}
                  checked={v.sku === variant.sku}
                  onChange={() => choose(v.sku)}
                />
                <span>{v.option_value}</span>
                <span class="hint mono">{v.available > 0 ? `${v.available} in stock` : 'sold out'}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div class="row" style="gap:calc(var(--unit) * 3)">
        <div class="stepper" role="group" aria-label="Quantity">
          <button
            type="button"
            class="btn quiet"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            disabled={qty <= 1 || soldOut || discontinued}
            aria-label="One fewer"
          >
            −
          </button>
          <output class="tnum" aria-live="polite" data-test="quantity">
            {qty}
          </output>
          <button
            type="button"
            class="btn quiet"
            onClick={() => setQty((q) => Math.min(Math.max(max, 1), q + 1))}
            disabled={qty >= Math.max(max, 1) || soldOut || discontinued}
            aria-label="One more"
          >
            +
          </button>
        </div>

        <button
          type="button"
          class="btn"
          onClick={add}
          disabled={soldOut || discontinued || state === 'working'}
          data-test="add-to-cart"
        >
          {discontinued ? 'No longer sold' : soldOut ? 'Sold out' : state === 'working' ? 'Adding' : 'Add to cart'}
        </button>
      </div>

      <p aria-live="polite" class={state === 'wrong' ? 'notice wrong' : state === 'done' ? 'notice done' : 'hint'}>
        {message ? (
          <>
            {state === 'done' ? <strong>Added. </strong> : null}
            {state === 'done' ? (
              <>
                {message} <a href="/cart">Go to your cart</a>.
              </>
            ) : (
              message
            )}
          </>
        ) : (
          ''
        )}
      </p>

      <style>{`
        .options { border: 0; padding: 0; margin: 0; }
        .options legend { padding: 0; margin-bottom: calc(var(--unit) * 2); }
        .option {
          display: inline-flex; align-items: center; gap: calc(var(--unit) * 2);
          border: 1px solid var(--rule); border-radius: var(--radius);
          padding: calc(var(--unit) * 2) calc(var(--unit) * 3); cursor: pointer;
        }
        .option[data-selected='true'] { border-color: var(--ink); font-weight: 700; }
        .option input { width: auto; min-height: 0; }
        .stepper { display: inline-flex; align-items: center; gap: calc(var(--unit) * 2); }
        .stepper output { min-width: 3ch; text-align: center; }
      `}</style>
    </div>
  );
}
