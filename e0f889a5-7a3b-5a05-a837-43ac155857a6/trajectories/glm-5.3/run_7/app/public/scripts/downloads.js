// The downloads page: the primary control adapts to the reader's platform but
// is never disabled and never hidden.
(function () {
  var note = document.querySelector('[data-platform-note]');
  if (!note) return;
  var platform = (navigator.platform || '') + ' ' + (navigator.userAgent || '');
  var onMac = /Mac|iPhone|iPad/i.test(platform);
  if (onMac) {
    note.textContent = 'Arranger is a macOS application. This Mac can run it.';
  } else {
    note.textContent = 'Arranger is a macOS application.';
  }
})();
