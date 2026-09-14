// Cameras: renaming, releasing, and signing out.
(function () {
  function sessionToken() {
    var m = document.cookie.match(/(?:^|;\s*)vela_session=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  document.querySelectorAll('[data-release]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var serial = btn.dataset.serial;
      // Removing releases the camera without giving it to anyone.
      var confirmed = window.confirm(
        'Remove this camera from your account? It is not given to anyone. You can register it again.'
      );
      if (!confirmed) return;
      btn.disabled = true;
      fetch('/api/account/devices/' + encodeURIComponent(serial), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + sessionToken() },
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (out) {
          if (!out.ok) { btn.disabled = false; btn.textContent = out.j && out.j.error ? out.j.error.message : 'That did not work.'; return; }
          window.location.reload();
        });
    });
  });

  var nick = document.querySelector('[data-nickname-form]');
  if (nick) {
    nick.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = nick.querySelector('[data-nickname-note]');
      var fd = new FormData(nick);
      fetch('/api/account/devices/' + encodeURIComponent(nick.dataset.serial), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessionToken() },
        body: JSON.stringify({ nickname: String(fd.get('nickname') || '') }),
      })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (note) note.textContent = 'Saved.'; });
    });
  }

  var signout = document.querySelector('[data-signout]');
  if (signout) {
    signout.addEventListener('submit', function (e) {
      e.preventDefault();
      document.cookie = 'vela_session=; Path=/; Max-Age=0';
      window.location.href = '/';
    });
  }
})();
