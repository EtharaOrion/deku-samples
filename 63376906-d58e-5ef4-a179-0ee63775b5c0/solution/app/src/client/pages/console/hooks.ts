/** Reading, writing and routing, written once for every console surface. */

import { useEffect, useState } from 'preact/hooks';
import type { Role } from '../../../shared/enums';
import { ApiError, api } from '../../api';
import type { Identity } from '../../routes';

export function detailOf(reason: unknown): string {
  if (reason instanceof ApiError) return reason.message;
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

interface Fetched<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload(): void;
}

/** One read per surface, restated on reload. A null path reads nothing. */
export function useFetch<T>(path: string | null): Fetched<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((answer) => {
        if (!live) return;
        setData(answer);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!live) return;
        setError(detailOf(reason));
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, attempt]);

  return {
    data,
    error,
    loading,
    reload: () => setAttempt((count) => count + 1),
  };
}

export function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function holdsRole(identity: Identity | null, role: Role): boolean {
  return identity !== null && identity.roles.includes(role);
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/console';
  return window.location.pathname;
}

export function navigate(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function internal(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute('href');
  if (!href || !href.startsWith('/console')) return false;
  /* A fragment on this very address is the browser's own job: it scrolls. */
  return !(anchor.pathname === window.location.pathname && anchor.hash !== '');
}

/**
 * The console routes on the address bar, so every screen renders alone on a
 * hard refresh and every link stays a real link a keyboard can reach.
 */
export function usePath(): string {
  const [path, setPath] = useState(currentPath());

  useEffect(() => {
    function onPopState(): void {
      setPath(currentPath());
      window.scrollTo(0, 0);
    }
    function onClick(event: MouseEvent): void {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor || !internal(anchor as HTMLAnchorElement)) return;
      event.preventDefault();
      navigate((anchor as HTMLAnchorElement).pathname + (anchor as HTMLAnchorElement).hash);
    }
    window.addEventListener('popstate', onPopState);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('click', onClick);
    };
  }, []);

  return path;
}

/** The record that would resolve a blocking condition, addressed by its prefix. */
export function referencePath(reference: string): string | null {
  if (reference.startsWith('OVR-')) return `/console/overrides/${reference}`;
  if (reference.startsWith('DEV-')) return `/console/deviations/${reference}`;
  if (reference.startsWith('LOT-')) return `/console/lots/${reference}`;
  if (reference.startsWith('BP-')) return `/console/balance/${reference}`;
  if (reference.startsWith('CERT-')) return `/console/certificates/${reference}`;
  return null;
}
