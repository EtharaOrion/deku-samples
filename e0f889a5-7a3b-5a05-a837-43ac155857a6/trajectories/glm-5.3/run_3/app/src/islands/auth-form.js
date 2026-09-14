import { api, setAuth } from '../lib/client.js';

class AuthForm extends HTMLElement {
  connectedCallback() {
    const mode = this.getAttribute('mode') || 'signin';
    const next = this.getAttribute('next') || '/account';
    const safeNext = next.startsWith('/') ? next : '/account';
    this.innerHTML = `
      <div class="auth">
        <h1>${mode === 'signin' ? 'Sign in' : 'Create an account'}</h1>
        ${mode === 'signin' ? `<form>
            <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" /></div>
            <div class="field"><label for="a-pw">Password</label><input id="a-pw" name="password" type="password" autocomplete="current-password" /></div>
            <p class="field-error" role="alert" data-error></p>
            <button class="btn btn-primary" type="submit">Sign in</button>
          </form>
          <p class="auth-note">No account yet? <a href="/sign-up?next=${encodeURIComponent(safeNext)}">Create one</a>. You can also check out as a guest.</p>`
        : `<form>
            <div class="field"><label for="a-name">Name</label><input id="a-name" name="name" type="text" autocomplete="name" /></div>
            <div class="field"><label for="a-email">Email</label><input id="a-email" name="email" type="email" autocomplete="email" /></div>
            <div class="field"><label for="a-pw">Password, at least eight characters</label><input id="a-pw" name="password" type="password" autocomplete="new-password" /></div>
            <p class="field-error" role="alert" data-error></p>
            <button class="btn btn-primary" type="submit">Create account</button>
          </form>
          <p class="auth-note">Already have one? <a href="/sign-in?next=${encodeURIComponent(safeNext)}">Sign in</a>.</p>`}
      </div>`;
    this.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = this.querySelector('[data-error]');
      err.textContent = '';
      const f = e.currentTarget;
      const body = {
        email: f.querySelector('[name="email"]').value.trim(),
        password: f.querySelector('[name="password"]').value
      };
      if (mode === 'signup') body.name = f.querySelector('[name="name"]').value.trim();
      try {
        const path = mode === 'signin' ? '/auth/login' : '/auth/signup';
        const d = await api.post(path, body);
        setAuth(d.access_token, d.customer);
        window.location.href = safeNext;
      } catch (e2) {
        err.textContent = e2.message || 'That did not work.';
      }
    });
  }
}
customElements.define('auth-form', AuthForm);
