// Auth: email and password for a bearer token, held in a cookie the server
// guards read. Signing out returns to the letter.
(function () {
  var signin = document.querySelector('[data-signin-form]');
  var signup = document.querySelector('[data-signup-form]');

  function err(form, msg) {
    var el = form && form.querySelector('[data-form-error]');
    if (el) el.textContent = msg || '';
  }

  function post(form, path, body) {
    var btn = form.querySelector('button[type=submit]');
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Working.';
    return fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (out) {
        btn.disabled = false;
        btn.textContent = original;
        return out;
      });
  }

  if (signin) {
    signin.addEventListener('submit', function (e) {
      e.preventDefault();
      err(signin, '');
      var fd = new FormData(signin);
      post(signin, '/api/auth/login', { email: fd.get('email'), password: fd.get('password') }).then(function (out) {
        if (!out.ok) { err(signin, (out.j && out.j.error && out.j.error.message) || 'That did not work.'); return; }
        document.cookie = 'vela_session=' + encodeURIComponent(out.j.access_token) + '; Path=/; Max-Age=1209600; SameSite=Lax';
        window.location.href = signin.dataset.next || '/account';
      });
    });
  }

  if (signup) {
    signup.addEventListener('submit', function (e) {
      e.preventDefault();
      err(signup, '');
      var fd = new FormData(signup);
      post(signup, '/api/auth/signup', { email: fd.get('email'), password: fd.get('password'), name: fd.get('name') }).then(function (out) {
        if (!out.ok) { err(signup, (out.j && out.j.error && out.j.error.message) || 'That did not work.'); return; }
        document.cookie = 'vela_session=' + encodeURIComponent(out.j.access_token) + '; Path=/; Max-Age=1209600; SameSite=Lax';
        window.location.href = '/account';
      });
    });
  }
})();
