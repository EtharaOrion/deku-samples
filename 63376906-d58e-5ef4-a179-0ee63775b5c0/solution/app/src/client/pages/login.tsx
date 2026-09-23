import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { LOGIN, SITE_NAME } from '../../shared/copy';
import { ApiError, login } from '../api';
import { Mark } from '../components/marks';
import { Banner } from '../components/status';

export function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [working, setWorking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  async function submit(event: Event): Promise<void> {
    event.preventDefault();
    setRefusal(null);
    if (!email) {
      setRefusal(LOGIN.missingEmail);
      return;
    }
    if (!password) {
      setRefusal(LOGIN.missingPassword);
      return;
    }
    setWorking(true);
    try {
      await login(email, password);
      window.location.assign('/console');
    } catch (error) {
      setRefusal(error instanceof ApiError ? error.message : String(error));
      setWorking(false);
    }
  }

  return (
    <section class="signin">
      <div class="signin__aside">
        <span class="eyebrow">{SITE_NAME}</span>
        <h2>{LOGIN.asideHeading}</h2>
        <p class="lede">{LOGIN.asideBody}</p>
      </div>

      <div class="signin__card">
        <div>
          <span class="eyebrow">{SITE_NAME}</span>
          <h1>{LOGIN.headline}</h1>
          <p class="field__note">{LOGIN.intro}</p>
        </div>

        {refusal ? <Banner word={LOGIN.refusalWord}>{LOGIN.refusal(refusal)}</Banner> : null}

        <form class="form" onSubmit={submit} noValidate>
          <div class="field">
            <label class="field__label" for="signin-email">
              {LOGIN.emailLabel}
            </label>
            <input
              id="signin-email"
              name="email"
              type="email"
              class="field__control"
              autocomplete="username"
              required
              value={email}
              onInput={(event) => setEmail((event.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <div class="field">
            <label class="field__label" for="signin-password">
              {LOGIN.passwordLabel}
            </label>
            <input
              id="signin-password"
              name="password"
              type="password"
              class="field__control"
              autocomplete="current-password"
              required
              value={password}
              onInput={(event) => setPassword((event.currentTarget as HTMLInputElement).value)}
            />
          </div>

          <button type="submit" class="submit" disabled={working}>
            <Mark
              name="arrow"
              labelFirst
              label={working ? LOGIN.submittingLabel : LOGIN.submitLabel}
            />
          </button>
        </form>
      </div>
    </section>
  );
}
