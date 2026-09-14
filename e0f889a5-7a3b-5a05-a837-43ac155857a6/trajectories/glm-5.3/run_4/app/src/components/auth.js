/** Email and password for a bearer token, held in sessionStorage. */
export function mountAuth(form) {
  if (!form) return;
  const error = form.querySelector('[data-auth-error]');
  const mode = form.dataset.mode;
  const next = form.dataset.next || '/account';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    const fd = new FormData(form);
    const payload = {
      email: String(fd.get('email') || ''),
      password: String(fd.get('password') || ''),
    };
    if (mode === 'signup') payload.name = String(fd.get('name') || '');

    try {
      const res = await fetch(`/api/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'That did not work.');
      sessionStorage.setItem('vela_token', body.access_token);
      document.cookie = `vela_token=${encodeURIComponent(body.access_token)}; Path=/; SameSite=Lax`;
      window.location.href = next.startsWith('/') ? next : '/account';
    } catch (err) {
      error.textContent = err.message;
    }
  });
}
