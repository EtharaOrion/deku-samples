/** One persistent top bar, identical on every route, set in the grotesk. */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SITE_NAME } from '../../shared/copy';
import { clearSession, readIdentity } from '../api';
import { NAV, type Identity, type RouteId } from '../routes';
import { words } from '../format';

interface TopBarProps {
  route: RouteId;
  identity?: Identity | null;
}

/** Scroll distance after which the bar takes its settled, opaque form. */
const SETTLE_AFTER_PX = 24;

export function TopBar({ route, identity }: TopBarProps): JSX.Element {
  const [reader, setReader] = useState<Identity | null>(identity ?? null);
  const [scrolled, setScrolled] = useState(false);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    if (identity) return;
    const stored = readIdentity();
    if (stored) setReader(stored);
  }, [identity]);

  useEffect(() => {
    const header = bar.current;
    if (!header) return;
    const root = document.documentElement;
    let frame = 0;

    const measure = (): void => {
      root.style.setProperty('--top-bar-height', `${header.offsetHeight}px`);
      root.style.setProperty('--viewport-width', `${root.clientWidth}px`);
    };
    const paint = (): void => {
      frame = 0;
      const y = window.scrollY;
      const travel = Math.max(1, root.scrollHeight - window.innerHeight);
      setScrolled(y > SETTLE_AFTER_PX);
      header.style.setProperty('--scroll-progress', String(Math.min(1, y / travel)));
    };
    const onScroll = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(paint);
    };

    measure();
    paint();
    const sizer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    sizer?.observe(header);
    sizer?.observe(root);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      sizer?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  function signOut(): void {
    clearSession();
    window.location.assign('/login');
  }

  const classes = ['top-bar'];
  if (route === 'home') classes.push('top-bar--stage');
  if (scrolled) classes.push('top-bar--scrolled');

  return (
    <header class={classes.join(' ')} ref={bar}>
      <div class="top-bar__backdrop" aria-hidden="true" />
      <div class="page top-bar__inner">
        <a class="wordmark" href="/">
          {SITE_NAME}
          <span class="wordmark__mark">Materials</span>
        </a>
        <nav class="top-bar__nav" aria-label="Ravel">
          {NAV.map((entry) => (
            <a
              key={entry.id}
              href={entry.path}
              aria-current={entry.id === route ? 'page' : undefined}
            >
              {entry.label}
            </a>
          ))}
          {reader ? (
            <>
              <span class="top-bar__identity">
                {`${reader.name}, ${words(reader.roles[0] ?? 'reader')}`}
              </span>
              <a href="/console" aria-current={route === 'console' ? 'page' : undefined}>
                Console
              </a>
              <button type="button" class="top-bar__sign-out" onClick={signOut}>
                Sign out
              </button>
            </>
          ) : (
            <a href="/login" aria-current={route === 'login' ? 'page' : undefined}>
              Sign in
            </a>
          )}
        </nav>
      </div>
      <span class="top-bar__progress" aria-hidden="true" />
    </header>
  );
}
