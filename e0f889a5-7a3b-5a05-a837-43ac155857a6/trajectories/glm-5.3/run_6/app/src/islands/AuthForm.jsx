import { createSignal, Show } from 'solid-js';
import { api, storeToken } from './lib.js';

// Account entry: email and password, exchanged for a bearer token.
export default function AuthForm(props) {
  const mode = () => props.mode || 'login';
  const [email, setEmail] = createSignal(props.prefillEmail || '');
  const [password, setPassword] = createSignal('');
  const [name, setName] = createSignal('');
  const [state, setState] = createSignal('idle');
  const [failure, setFailure] = createSignal('');

  const submit = async (event) => {
    event.preventDefault();
    setState('working');
    setFailure('');
    try {
      const path = mode() === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body = mode() === 'signup' ? { email: email(), password: password(), name: name() } : { email: email(), password: password() };
      const result = await api(path, { method: 'POST', body });
      storeToken(result.access_token);
      const next = new URL(props.next || '/account', window.location.origin);
      window.location.href = next.pathname + next.search;
    } catch (err) {
      setState('idle');
      setFailure(err.message);
    }
  };

  return (
    <form onSubmit={submit} novalidate>
      <Show when={failure()}>
        <div class="notice wrong" role="alert">{failure()}</div>
      </Show>

      <Show when={mode() === 'signup'}>
        <div class="field">
          <label for="name">Name</label>
          <input id="name" type="text" autocomplete="name" value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </div>
      </Show>

      <div class="field">
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          autocomplete="email"
          value={email()}
          onInput={(e) => setEmail(e.currentTarget.value)}
          required
        />
      </div>

      <div class="field">
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          autocomplete={mode() === 'signup' ? 'new-password' : 'current-password'}
          value={password()}
          onInput={(e) => setPassword(e.currentTarget.value)}
          required
        />
        <Show when={mode() === 'signup'}>
          <p class="hint">Eight characters or more.</p>
        </Show>
      </div>

      <button class="btn" type="submit" disabled={state() === 'working'}>
        {state() === 'working' ? 'Checking' : mode() === 'signup' ? 'Create the account' : 'Sign in'}
      </button>

      <p class="hint">
        <Show
          when={mode() === 'signup'}
          fallback={<a href={`/sign-up${props.nextQuery || ''}`}>Create an account instead</a>}
        >
          <a href={`/sign-in${props.nextQuery || ''}`}>Sign in instead</a>
        </Show>
      </p>
    </form>
  );
}
