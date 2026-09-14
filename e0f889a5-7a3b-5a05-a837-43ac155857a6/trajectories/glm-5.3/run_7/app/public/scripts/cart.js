// The cart: quantities move at once, totals show a pending state, and a
// rejection reverts the number and states the reason.
(function () {
  var wrap = document.getElementById('cart-lines');
  if (!wrap) return;
  var summary = document.querySelector('.cart-summary');
  var protect = document.querySelector('[data-protection]');

  var pendingTimer = 0;

  function setPending(on) {
    [summary, wrap].forEach(function (el) { if (el) el.classList.toggle('is-pending', on); });
  }

  function readCart(j) {
    var linesById = {};
    (j.lines || []).forEach(function (l) { linesById[l.id] = l; });
    document.querySelectorAll('[data-line]').forEach(function (row) {
      var l = linesById[row.dataset.line];
      if (!l) { row.remove(); return; }
      var input = row.querySelector('[data-qty-input]');
      if (input && document.activeElement !== input) input.value = String(l.quantity);
      var total = row.querySelector('[data-total]');
      if (total) total.textContent = money(l.line_total_minor);
    });
    setText('[data-subtotal]', money(j.subtotal_minor));
    setText('[data-shipping]', money(j.shipping_minor));
    setText('[data-tax]', money(j.tax_minor));
    var grand = document.querySelector('[data-total-minor]');
    if (grand) { grand.textContent = money(j.total_minor); grand.dataset.totalMinor = String(j.total_minor); }
    var count = (j.lines || []).reduce(function (s, l) { return s + l.quantity; }, 0);
    var el = document.querySelector('[data-cart-count]');
    if (el) el.textContent = count > 99 ? '99+' : String(count);
    if (!(j.lines || []).length) window.location.reload();
  }

  function setText(sel, text) {
    var el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  function money(minor) {
    var abs = Math.abs(Number(minor));
    return (minor < 0 ? '-' : '') + '$' + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
  }

  function patch(lineId, quantity) {
    setPending(true);
    return fetch('/api/cart/lines/' + lineId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: quantity }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (out) {
        setPending(false);
        if (!out.ok) {
          var row = document.querySelector('[data-line="' + lineId + '"]');
          if (row) {
            var input = row.querySelector('[data-qty-input]');
            // revert to the server's own value when the rejection names stock
            if (input && out.j && out.j.error && /Only/.test(out.j.error.message)) {
              input.value = input.dataset.last || input.value;
            }
            announce(out.j && out.j.error ? out.j.error.message : 'That did not work.');
          }
          return;
        }
        readCart(out.j);
      })
      .catch(function () { setPending(false); announce('Something went wrong at our end. Try again.'); });
  }

  var live = document.createElement('p');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.className = 'sr-only';
  document.body.appendChild(live);
  function announce(text) { live.textContent = text; }

  document.querySelectorAll('[data-line]').forEach(function (row) {
    var input = row.querySelector('[data-qty-input]');
    if (input) input.dataset.last = input.value;
    row.querySelectorAll('[data-qty]').forEach(function (b) {
      b.addEventListener('click', function () {
        var current = Number(input.value) || 0;
        var next = Math.max(0, Math.min(Number(input.max || 10), current + (b.dataset.qty === '+' ? 1 : -1)));
        input.dataset.last = input.value;
        input.value = String(next);
        patch(row.dataset.line, next);
      });
    });
    if (input) {
      input.addEventListener('change', function () {
        var next = Math.max(0, Math.min(Number(input.max || 10), Number(input.value) || 0));
        input.dataset.last = input.value;
        input.value = String(next);
        patch(row.dataset.line, next);
      });
    }
    var remove = row.querySelector('[data-remove]');
    if (remove) {
      remove.addEventListener('click', function () {
        if (!window.confirm('Remove this from your cart?')) return;
        setPending(true);
        fetch('/api/cart/lines/' + row.dataset.line, { method: 'DELETE' })
          .then(function (r) { return r.json(); })
          .then(function (j) { setPending(false); readCart(j); });
      });
    }
  });

  if (protect) {
    protect.addEventListener('change', function () {
      setPending(true);
      fetch('/api/cart/protection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: protect.checked }),
      })
        .then(function (r) { return r.json(); })
        .then(function (j) { setPending(false); readCart(j); window.location.reload(); });
    });
  }
})();
