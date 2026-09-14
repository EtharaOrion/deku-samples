import { h } from 'preact';
import { useState } from 'preact/hooks';
import { Meta } from '../components/ui.jsx';
import { login } from '../lib/api.js';
import { Link } from '../lib/router.jsx';
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError(null);
    const r = await login(email, password);
    setBusy(false);
    if (r.ok) { location.href = '/console'; } else setError(r.error);
  };
  return h('div', { class: 'route shell', style: 'max-width:38rem' },
    h(Meta, { title: 'Sign in | Ravel console', description: 'Sign in to the Ravel operational console.' }),
    h('h1', null, 'Sign in'),
    h('p', { class: 'body-big' }, 'Signup is closed. The seven seeded accounts are the only accounts, and each authenticates at the identity provider.'),
    error ? h('div', { class: 'banner', role: 'alert' },
      h('p', { class: 'label' }, 'Sign-in refused'),
      h('p', null, 'That email and password were not accepted. Check the address and the password and try again.')) : null,
    h('form', { onSubmit: submit },
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'email' }, 'Email'),
        h('input', { id: 'email', type: 'email', required: true, value: email, onChange: (e) => setEmail(e.target.value), autocomplete: 'username' })),
      h('div', { class: 'field' }, h('label', { class: 'label', for: 'password' }, 'Password'),
        h('input', { id: 'password', type: 'password', required: true, value: password, onChange: (e) => setPassword(e.target.value), autocomplete: 'current-password' })),
      h('button', { class: 'btn btn-primary', type: 'submit', disabled: busy }, busy ? 'Signing in…' : 'Sign in ', h('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'))),
    h('p', { class: 'small' }, 'A session expires twelve hours after issue.'));
}
