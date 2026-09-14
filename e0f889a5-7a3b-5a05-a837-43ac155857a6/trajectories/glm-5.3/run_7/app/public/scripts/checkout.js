// The three checkout steps. Values survive back navigation because they live
// on the server against the cart.
(function () {
  var stepForm = document.querySelector('[data-step-form]');
  var placeForm = document.querySelector('[data-place-form]');

  function err(msg) {
    var el = document.querySelector('[data-form-error]');
    if (el) el.textContent = msg || '';
  }

  if (stepForm) {
    stepForm.addEventListener('submit', function (e) {
      e.preventDefault();
      err('');
      var fd = new FormData(stepForm);
      var payload;
      if (stepForm.dataset.methodStep !== undefined) {
        var chosen = fd.get('shipping_method');
        if (!chosen) { err('Choose a delivery method.'); return; }
        payload = { shipping_method: String(chosen) };
      } else {
        var address = {};
        ['name', 'line1', 'line2', 'city', 'region', 'postal_code', 'country', 'phone'].forEach(function (k) {
          address[k] = String(fd.get(k) || '');
        });
        for (var k in address) {
          if (k !== 'line2' && k !== 'phone' && k !== 'region' && !address[k]) {
            err(labelFor(k) + ' is required.');
            var input = stepForm.querySelector('[name="' + k + '"]');
            if (input) input.focus();
            return;
          }
        }
        payload = {
          email: String(fd.get('email') || ''),
          shipping_address: address,
        };
      }
      var btn = stepForm.querySelector('button[type=submit]');
      var original = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Saving.';
      fetch('/api/cart/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (out) {
          if (!out.ok) {
            btn.disabled = false;
            btn.textContent = original;
            err(out.j && out.j.error ? out.j.error.message : 'That did not work.');
            return;
          }
          window.location.href = stepForm.dataset.next || (stepForm.querySelector('script') && stepForm.querySelector('script').dataset.next) || '/cart';
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = original;
          err('Something went wrong at our end. Try again.');
        });
    });
  }

  function labelFor(key) {
    var map = {
      name: 'Name', line1: 'Address line 1', city: 'City', postal_code: 'Postal code',
      country: 'Country', email: 'Email',
    };
    return map[key] || key;
  }

  if (placeForm) {
    placeForm.addEventListener('submit', function (e) {
      e.preventDefault();
      err('');
      var btn = placeForm.querySelector('[data-place-button]');
      var expected = Number(placeForm.dataset.expectedTotal || 0);
      btn.disabled = true;
      btn.textContent = 'Placing your order';
      var key = 'vela-order-key-' + expected;
      var idempotencyKey = sessionStorage.getItem(key);
      if (!idempotencyKey) {
        idempotencyKey = 'ord-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem(key, idempotencyKey);
      }
      fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ expected_total_minor: expected }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (out) {
          if (!out.ok) {
            btn.disabled = false;
            btn.textContent = 'Place the order';
            var code = out.j && out.j.error && out.j.error.code;
            err((out.j && out.j.error && out.j.error.message) || 'That did not work.');
            if (code === 'price_changed' || code === 'out_of_stock') {
              window.location.href = '/cart';
            }
            return;
          }
          var number = out.j.number;
          var token = out.j.access_token;
          sessionStorage.removeItem(key);
          window.location.href = '/orders/' + encodeURIComponent(number) + '?access_token=' + encodeURIComponent(token);
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = 'Place the order';
          err('Something went wrong at our end. Try again.');
        });
    });
  }
})();
