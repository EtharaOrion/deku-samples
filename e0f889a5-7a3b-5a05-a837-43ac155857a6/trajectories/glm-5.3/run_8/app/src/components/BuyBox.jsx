import { useEffect, useState } from 'preact/hooks';

export default function BuyBox({ handle, title, variants = [], selectedSku = '', state = 'available', badVariant = false }) {
  const [sku, setSku] = useState(selectedSku || (variants[0] ? variants[0].sku : ''));
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const variant = variants.find((v) => v.sku === sku) || variants[0] || null;
  const maxQty = variant ? Math.min(10, variant.inventory_policy === 'deny' ? variant.available : 10) : 1;
  const soldOut = !variant || (variant.inventory_policy === 'deny' && variant.available <= 0);
  const disabled = state === 'discontinued' || soldOut || busy;
  const why = state === 'discontinued' ? 'We no longer sell this.' : soldOut ? 'Sold out.' : busy ? 'Adding' : '';

  useEffect(() => {
    if (badVariant) {
      const url = new URL(window.location.href);
      url.searchParams.delete('variant');
      window.history.replaceState({}, '', url);
    }
  }, [badVariant]);

  const choose = (v) => {
    setSku(v.sku);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', v.sku);
    window.history.replaceState({}, '', url);
  };

  const add = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const res = await fetch('/api/cart/lines', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, quantity: qty }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body?.error?.message || 'That did not work.'); return; }
      setMsg(`${title} is in your cart.`);
      window.dispatchEvent(new CustomEvent('vela-cart'));
      window.dispatchEvent(new MessageEvent('message', { data: 'vela:cart' }));
    } catch {
      setErr('That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="buybox">
      <fieldset>
        <legend>Option</legend>
        <div class="options" role="radiogroup" aria-label="Option">
          {variants.map((v) => (
            <label class={`option${v.sku === sku ? ' chosen' : ''}`}>
              <input
                type="radio"
                name="variant"
                value={v.sku}
                checked={v.sku === sku}
                onChange={() => choose(v)}
                disabled={state === 'discontinued'}
              />
              <span>{v.option_value}</span>
              <span class="tnum price-inline">{fmt(v.price_minor)}</span>
              {v.inventory_policy === 'deny' && v.available <= 0 ? <span class="muted small">Sold out</span> : null}
              {v.inventory_policy === 'deny' && v.available > 0 && v.available <= 10 ? <span class="muted small tnum">Only {v.available} left</span> : null}
            </label>
          ))}
        </div>
      </fieldset>
      <div class="qty">
        <label for="qty">Quantity</label>
        <div class="stepper">
          <button type="button" class="btn" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}>−</button>
          <input id="qty" class="tnum" type="text" inputmode="numeric" value={qty} aria-live="polite"
            onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ''), 10); setQty(Number.isFinite(n) ? Math.max(1, Math.min(maxQty, n)) : 1); }} />
          <button type="button" class="btn" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty}>+</button>
        </div>
        <span class="muted small">Up to {maxQty}</span>
      </div>
      <div class="buy">
        <button type="button" class="btn btn-primary" onClick={add} disabled={disabled}>
          {state === 'discontinued' ? 'Discontinued' : soldOut ? 'Sold out' : busy ? 'Adding' : 'Add to cart'}
        </button>
        {why ? <span class="muted small">{why}</span> : null}
      </div>
      {err ? <p class="error-text" role="alert">{err}</p> : null}
      {msg ? <p class="ok-text" role="status">{msg} <a href="/cart">View cart</a></p> : null}
    </div>
  );
}

function fmt(minor) {
  const abs = Math.abs(minor);
  return `$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
