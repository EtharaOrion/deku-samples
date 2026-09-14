/** Camera detail actions: rename, remove, hand over. Destructive acts confirm first. */
export function mountCameraActions(renameForm, removeForm, handoverForm, actionFeedback, renameFeedback, ctx) {
  const serial = ctx.serial;
  const token = () => sessionStorage.getItem('vela_token') || '';

  async function api(path, method, body) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error?.message || 'That did not work.');
    return data;
  }

  renameForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    renameFeedback.textContent = '';
    const nickname = new FormData(renameForm).get('nickname');
    try {
      await api(`/api/account/devices/${encodeURIComponent(serial)}`, 'PATCH', { nickname });
      renameFeedback.textContent = 'Saved.';
    } catch (err) {
      renameFeedback.textContent = err.message;
    }
  });

  function confirmAndCall(form, message, run) {
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!window.confirm(message)) return;
      actionFeedback.textContent = 'Working';
      try {
        await run();
        window.location.href = '/account/cameras';
      } catch (err) {
        actionFeedback.textContent = err.message;
      }
    });
  }

  confirmAndCall(
    removeForm,
    removeForm?.querySelector('[data-confirm]')?.dataset.confirm || 'Remove this camera?',
    () => api(`/api/account/devices/${encodeURIComponent(serial)}`, 'DELETE')
  );

  confirmAndCall(
    handoverForm,
    handoverForm?.querySelector('[data-confirm]')?.dataset.confirm || 'Hand this camera over?',
    () => api(`/api/account/devices/${encodeURIComponent(serial)}`, 'DELETE')
  );
}
