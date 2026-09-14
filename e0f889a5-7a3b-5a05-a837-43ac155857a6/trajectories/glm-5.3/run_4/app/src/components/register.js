/**
 * The register row. Shape is validated instantly, then the serial is looked up.
 * Success adds the card and fades its confirmation; a price notice never fades.
 */
const SERIAL_RE = /^[A-Z]{2}\d{4}[A-HJ-NP-Z2-9]{6}$/;

export function mountRegister(root) {
  if (!root) return;
  const form = root.querySelector('[data-register-form]');
  const input = root.querySelector('[data-serial-input]');
  const feedback = root.querySelector('[data-register-feedback]');

  input.addEventListener('input', () => {
    const raw = input.value.toUpperCase();
    const compact = raw.replace(/[^A-Z0-9]/g, '').slice(0, 12);
    // Grouped as it is typed, stored unformatted.
    const grouped = compact.replace(/^(.{2})(.{2})(.{2})(.*)$/, '$1 $2 $3 $4').trim();
    input.value = raw.endsWith(' ') || raw.length < compact.length ? raw : grouped;
    if (compact.length === 12 && !SERIAL_RE.test(compact)) {
      feedback.textContent = 'A serial is twelve characters, engraved on the underside.';
      feedback.className = 'feedback notice-wrong';
    } else if (compact.length < 12) {
      feedback.textContent = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const serial = input.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (serial.length !== 12 || !SERIAL_RE.test(serial)) {
      feedback.textContent = 'A serial is twelve characters, engraved on the underside.';
      feedback.className = 'feedback notice-wrong';
      return;
    }
    feedback.textContent = 'Checking';
    feedback.className = 'feedback';
    try {
      const res = await fetch('/api/account/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('vela_token') || ''}`,
        },
        body: JSON.stringify({ serial }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'That did not work.');
      feedback.textContent = 'Registered.';
      feedback.className = 'feedback notice-finished';
      setTimeout(() => window.location.reload(), 600);
    } catch (err) {
      feedback.textContent = err.message;
      feedback.className = 'feedback notice-wrong';
    }
  });
}
