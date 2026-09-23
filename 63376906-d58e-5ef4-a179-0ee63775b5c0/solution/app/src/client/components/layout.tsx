/** The chrome: one top bar and one footer, identical on every route. */

import type { ComponentChildren, JSX } from 'preact';
import { PRIVACY, SITE_NAME, VERIFY_HOST } from '../../shared/copy';
import type { Identity, RouteId } from '../routes';
import { TopBar } from './topbar';

interface PageShellProps {
  route: RouteId;
  identity?: Identity | null;
  surface?: 'public' | 'console';
  children: ComponentChildren;
}

export function PageShell({
  route,
  identity,
  surface = 'public',
  children,
}: PageShellProps): JSX.Element {
  return (
    <div class={surface === 'console' ? 'route-console' : 'route-public'}>
      <a class="skip-link" href="#main">
        Skip to the content
      </a>
      <TopBar route={route} identity={identity} />
      <main id="main" class="page column">
        {children}
      </main>
      <footer class="site-footer">
        <div class="page column">
          <p class="meta-line">
            {`${PRIVACY.controller}, ${PRIVACY.postalAddress}.`}
          </p>
          <p class="meta-line">
            {`A ${SITE_NAME} certificate is checked at ${VERIFY_HOST}/verify/ followed by its number. `}
            <a href="/privacy">Privacy</a>
            {' · '}
            <a href="/contact">Contact</a>
            {' · '}
            <a href={`mailto:${PRIVACY.disclosureAddress}`}>{PRIVACY.disclosureAddress}</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
