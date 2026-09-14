/** One-click serial registration from an order page. */
export function mountOrderSerials(section, feedback) {
  if (!section) return;
  section.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-register-one]');
    if (!btn) return;
    const serial = btn.dataset.serial;
    btn.disabled = true;
    feedback.textContent = 'Registering';
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
      feedback.textContent = `${serial} is registered to you.`;
      btn.textContent = 'Registered';
    } catch (err) {
      feedback.textContent = err.message;
      btn.disabled = false;
    }
  });
}
