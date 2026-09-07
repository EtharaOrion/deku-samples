// The register row island. One field for the serial, grouped as it is typed and
// stored unformatted, validated for shape instantly and then looked up.

const form = document.querySelector('[data-register]');
if (form) {
  // The hint, the error and the live region sit beside the form rather than
  // inside it, so they are looked up from the document.
  const input = form.querySelector('[data-serial-input]');
  const button = form.querySelector('[data-register-button]');
  const hint = document.querySelector('[data-shape-hint]');
  const error = document.querySelector('[data-register-error]');
  const live = document.querySelector('[data-register-live]');

  const SHAPE = /^[A-Z]{2}\d{4}[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;
  const raw = () => input.value.replace(/[\s-]/g, '').toUpperCase();

  function group(v) {
    // Grouped as it is typed; the value we send is unformatted.
    return v.replace(/(.{4})(?=.)/g, '$1 ').trim();
  }

  input.addEventListener('input', () => {
    const before = input.selectionStart;
    const v = raw().slice(0, 12);
    const formatted = group(v);
    const grew = formatted.length - input.value.length;
    input.value = formatted;
    if (before !== null) {
      const pos = Math.max(0, before + (grew > 0 ? grew : 0));
      input.setSelectionRange(pos, pos);
    }

    // Validated for shape instantly. The control stays operable throughout, so
    // the shape is stated rather than the control quietly withheld.
    if (!v) {
      hint.textContent = 'Twelve characters, from the underside of the camera.';
    } else if (SHAPE.test(v)) {
      hint.textContent = 'That is the right shape.';
    } else {
      hint.textContent = `${v.length} of 12 characters.`;
    }
    error.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const serial = raw();
    if (!SHAPE.test(serial)) {
      error.textContent = 'We do not recognise that serial number.';
      error.hidden = false;
      return;
    }
    button.disabled = true;
    button.textContent = 'Registering';
    error.hidden = true;
    live.textContent = 'Registering that camera.';

    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serial }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Never the other person's identity.
        error.textContent = data.message || 'That did not work.';
        error.hidden = false;
        live.textContent = data.message || 'That did not work.';
        button.disabled = false;
        button.textContent = 'Register';
        return;
      }
      live.textContent = `${data.model}, serial ${data.serial}, is now on your account.`;
      // Success adds the card and raises a brief confirmation.
      window.location.href = `/account/cameras?registered=${encodeURIComponent(data.serial)}`;
    } catch {
      error.textContent = 'That did not work. Try again.';
      error.hidden = false;
      button.disabled = false;
      button.textContent = 'Register';
    }
  });

  // Removing and handing over are different actions and the copy never blurs them.
  document.querySelectorAll('[data-release]').forEach((b) => {
    b.addEventListener('click', (e) => {
      const serial = b.dataset.release;
      if (!window.confirm(`Remove ${serial} from your account? It will belong to nobody until somebody registers it.`)) {
        e.preventDefault();
      }
    });
  });
}
