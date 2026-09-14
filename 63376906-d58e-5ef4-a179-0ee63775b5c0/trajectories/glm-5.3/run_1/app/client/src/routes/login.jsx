import { h } from 'preact';
import { useState } from 'preact/hooks';
import { login } from '../lib/api.js';
import { navigate } from '../lib/router.jsx';
import { Footer, Banner } from '../components/chrome.jsx';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await login(email, password);
    setBusy(false);
    if (r.ok) navigate('/console'); else setErr(r.error);
  };
  return h('div', null,
    h('main', { style: 'max-width:34rem' },
      h('h1', null, 'Sign in'),
      h('p', { class: 'lede' }, 'Signup is closed. The seven seeded accounts are the only accounts.'),
      h('form', { onSubmit: submit, class: 'sheet' },
        h('fieldset', null, h('label', { class: 'label', for: 'email' }, 'Email'), h('input', { id: 'email', type: 'email', autocomplete: 'username', value: email, onInput: (e) => setEmail(e.target.value) })),
        h('fieldset', null, h('label', { class: 'label', for: 'password' }, 'Password'), h('input', { id: 'password', type: 'password', autocomplete: 'current-password', value: password, onInput: (e) => setPassword(e.target.value) })),
        h('button', { type: 'submit', disabled: busy }, busy ? 'Signing in\u2026' : 'Sign in'),
        err ? h(Banner, { title: 'Not signed in' }, 'Those credentials were not accepted. Every account signs in with the password issued to it.') : null
      )
    ),
    h(Footer)
  );
}
