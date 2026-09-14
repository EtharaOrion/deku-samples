// The register row: shape validated instantly, then looked up. Grouped as it
// is typed, stored unformatted.
(function () {
  var form = document.querySelector('[data-register-form]');
  if (!form) return;
  var input = form.querySelector('[data-serial-input]');
  var note = document.querySelector('[data-register-note]');
  var errorEl = document.querySelector('[data-register-error]');

  var SHAPE = /^(VA|VC)\d{2}(0[1-9]|[1-4]\d|5[0-3])[2-9A-HJ-NP-Z]{6}$/;

  function grouped(value) {
    var raw = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    return raw.replace(/^(.{2})(.{0,2})(.{0,2})(.{0,6})$/, function (_, a, b, c, d) {
      return [a, b, c, d].filter(Boolean).join(' ');
    });
  }

  input.addEventListener('input', function () {
    var raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    input.value = grouped(raw);
    errorEl.textContent = '';
    if (raw.length === 12 && !SHAPE.test(raw)) {
      errorEl.textContent = 'That does not look like a Vela serial number.';
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var raw = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!SHAPE.test(raw)) {
      errorEl.textContent = 'That does not look like a Vela serial number.';
      return;
    }
    note.textContent = '';
    errorEl.textContent = '';
    fetch('/api/account/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionToken() },
      body: JSON.stringify({ serial: raw }),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (out) {
        if (!out.ok) {
          errorEl.textContent = (out.j && out.j.error && out.j.error.message) || 'That did not work.';
          return;
        }
        note.textContent = 'Registered. ' + out.j.model + ' is yours.';
        input.value = '';
        setTimeout(function () { window.location.reload(); }, 700);
      });
  });

  // also serves the one-click register button on an order page
  document.querySelectorAll('[data-register-serial]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Registering.';
      fetch('/api/account/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionToken() },
        body: JSON.stringify({ serial: btn.dataset.registerSerial }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (out) {
          if (!out.ok) { btn.textContent = out.j && out.j.error ? out.j.error.message : 'That did not work.'; btn.disabled = false; return; }
          btn.textContent = 'Registered.';
        });
    });
  });

  function sessionToken() {
    var m = document.cookie.match(/(?:^|;\s*)vela_session=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
})();
