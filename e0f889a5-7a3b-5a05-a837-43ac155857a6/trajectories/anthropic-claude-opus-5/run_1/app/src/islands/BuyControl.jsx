import { useEffect, useMemo, useState } from 'preact/hooks';

const money = (minor) => {
  const n = Math.trunc(Number(minor));
  const whole = Math.trunc(Math.abs(n) / 100);
  const cents = Math.abs(n) % 100;
  return `${n < 0 ? '-' : ''}$${String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${String(cents).padStart(2, '0')}`;
};

// One radio group per option rather than a select when there are five or fewer
// choices, a quantity stepper, and one primary buy control.
export default function BuyControl({ product, initialSku }) {
  const variants = product.variants || [];
  const [sku, setSku] = useState(() => {
    const found = variants.find((v) => v.sku === initialSku);
    return (found || variants[0] || {}).sku || '';
  });
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');

  const variant = useMemo(() => variants.find((v) => v.sku === sku) || variants[0] || null, [sku, variants]);
  const discontinued = product.status === 'discontinued';
  const available = Number(variant?.available ?? 0);
  const soldOut = available <= 0;
  const buyable = Boolean(variant) && !discontinued && !soldOut;
  const maxQty = Math.max(1, Math.min(10, available));

  useEffect(() => {
    if (quantity > maxQty) setQuantity(maxQty);
  }, [maxQty]);

  // Choosing an option updates the address by replacing history rather than
  // pushing it, so the back control leaves the product page.
  useEffect(() => {
    if (!variant) return;
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.sku);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }, [variant?.sku]);

  const add = async () => {
    if (!buyable || state === 'working') return;
    setState('working');
    setMessage('');
    try {
      const res = await fetch('/api/cart/lines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sku: variant.sku, quantity }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState('error');
        setMessage(body.message || 'That did not work.');
        return;
      }
      setState('done');
      setMessage(`Added to your cart. ${body.item_count} ${body.item_count === 1 ? 'item' : 'items'} in the cart.`);
      const badge = document.querySelector('.cart-badge');
      const control = document.querySelector('.cart-control');
      if (control) {
        const count = Number(body.item_count || 0);
        control.setAttribute('aria-label', `Cart, ${count} ${count === 1 ? 'item' : 'items'}`);
        if (badge) badge.textContent = count > 99 ? '99+' : String(count);
        else if (count > 0) {
          const span = document.createElement('span');
          span.className = 'cart-badge tabular';
          span.setAttribute('aria-hidden', 'true');
          span.textContent = count > 99 ? '99+' : String(count);
          control.appendChild(span);
        }
      }
    } catch {
      setState('error');
      setMessage('That did not work. Check your connection and try again.');
    }
  };

  const availabilityLine = () => {
    if (discontinued) return 'We no longer sell this.';
    if (soldOut) return 'Sold out';
    if (available <= 10) return `Only ${available} left`;
    return 'Available';
  };

  return (
    <div class="buy">
      <p class="buy-price price tabular">{money(variant?.price_minor ?? product.price_minor)}</p>
      <p class="buy-availability" data-state={discontinued ? 'discontinued' : soldOut ? 'sold_out' : available <= 10 ? 'low' : 'available'}>
        {availabilityLine()}
      </p>

      {variants.length > 1 && variants.length <= 5 && (
        <fieldset class="radio-group buy-options">
          <legend class="field-label">Finish</legend>
          {variants.map((v) => {
            const vSoldOut = Number(v.available) <= 0;
            return (
              <label class="radio-option">
                <input
                  type="radio"
                  name="variant"
                  value={v.sku}
                  checked={v.sku === variant?.sku}
                  onChange={() => setSku(v.sku)}
                />
                <span>{v.option_value}</span>
                <span class="option-state">
                  {vSoldOut ? 'Sold out' : Number(v.available) <= 10 ? `Only ${v.available} left` : ''}
                </span>
                <span class="option-price price tabular">{money(v.price_minor)}</span>
              </label>
            );
          })}
        </fieldset>
      )}

      {variants.length > 5 && (
        <label class="field">
          <span class="field-label">Finish</span>
          <select class="input" value={variant?.sku} onChange={(e) => setSku(e.currentTarget.value)}>
            {variants.map((v) => <option value={v.sku}>{v.option_value}</option>)}
          </select>
        </label>
      )}

      <div class="buy-quantity">
        <span class="field-label" id="qty-label">Quantity</span>
        <div class="stepper" role="group" aria-labelledby="qty-label">
          <button
            type="button"
            class="button button-quiet button-small"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1 || !buyable}
          >
            <span aria-hidden="true">−</span>
            <span class="visually-hidden">One fewer</span>
          </button>
          <output class="stepper-value tabular" aria-live="off">{quantity}</output>
          <button
            type="button"
            class="button button-quiet button-small"
            onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
            disabled={quantity >= maxQty || !buyable}
          >
            <span aria-hidden="true">+</span>
            <span class="visually-hidden">One more</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        class="button buy-button"
        onClick={add}
        disabled={!buyable || state === 'working'}
      >
        {discontinued ? 'No longer sold' : soldOut ? 'Sold out' : state === 'working' ? 'Adding' : 'Add to cart'}
      </button>

      {/* Success is stated in words before it is coloured. */}
      <p
        class={`buy-message ${state === 'error' ? 'buy-message-wrong' : state === 'done' ? 'buy-message-done' : ''}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>

      <noscript>
        <form method="post" action="/cart/add">
          <input type="hidden" name="sku" value={variant?.sku} />
          <input type="hidden" name="quantity" value="1" />
          <button class="button" type="submit" disabled={!buyable}>Add to cart</button>
        </form>
      </noscript>
    </div>
  );
}
