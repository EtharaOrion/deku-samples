// The product page island: option choice replaces history so the back control
// leaves the product page, and adding to cart is optimistic then authoritative.
(function () {
  var form = document.querySelector('[data-buy-form]');
  if (!form) return;
  var note = form.querySelector('[data-add-note]');
  var priceEl = document.querySelector('[data-price]');
  var qty = form.querySelector('[data-qty-input]');

  var radios = Array.prototype.slice.call(form.querySelectorAll('input[type=radio][name=variant]'));
  radios.forEach(function (r) {
    r.addEventListener('change', function () {
      var url = new URL(window.location.href);
      url.searchParams.set('variant', r.value);
      window.history.replaceState({}, '', url);
      if (priceEl) priceEl.textContent = money(Number(r.dataset.price));
      form.dataset.sku = r.value;
      var max = Math.max(1, Math.min(10, Number(r.dataset.available) || 1));
      if (qty) { qty.max = String(max); qty.value = '1'; }
      radios.forEach(function (other) {
        var label = other.closest('.radio');
        if (label) label.classList.toggle('is-selected', other.checked);
      });
      updateStockNote(r);
    });
  });

  function updateStockNote(r) {
    var reason = document.getElementById('stock-reason');
    var btn = form.querySelector('button[type=submit]');
    var off = r.disabled;
    if (btn) btn.disabled = off;
    if (reason) reason.textContent = off ? 'Sold out.' : '';
  }

  form.querySelectorAll('[data-qty]').forEach(function (b) {
    b.addEventListener('click', function () {
      var step = b.dataset.qty === '+' ? 1 : -1;
      var v = Math.max(1, Math.min(Number(qty.max || 10), (Number(qty.value) || 1) + step));
      qty.value = String(v);
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var sku = form.dataset.sku || (radios[0] && radios[0].value);
    if (!sku) return;
    var quantity = Math.max(1, Math.min(10, Number(qty && qty.value) || 1));
    note.textContent = 'Adding.';
    note.classList.remove('is-error');
    fetch('/api/cart/lines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku: sku, quantity: quantity }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (out) {
        if (!out.ok) {
          note.textContent = (out.j && out.j.error && out.j.error.message) || 'That did not work.';
          note.classList.add('is-error');
          return;
        }
        note.textContent = 'Added to your cart.';
        updateCartCount(out.j.lines.reduce(function (s, l) { return s + l.quantity; }, 0));
      })
      .catch(function () {
        note.textContent = 'Something went wrong at our end. Try again.';
        note.classList.add('is-error');
      });
  });

  function money(minor) {
    var sign = minor < 0 ? '-' : '';
    var abs = Math.abs(Number(minor));
    return sign + '$' + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
  }

  function updateCartCount(n) {
    var el = document.querySelector('[data-cart-count]');
    if (el) el.textContent = n > 99 ? '99+' : String(n);
    var sr = document.querySelector('[data-cart-link] .sr-only');
    if (sr) sr.textContent = n === 0 ? 'Cart, empty' : 'Cart, ' + n + (n === 1 ? ' item' : ' items');
  }
})();
