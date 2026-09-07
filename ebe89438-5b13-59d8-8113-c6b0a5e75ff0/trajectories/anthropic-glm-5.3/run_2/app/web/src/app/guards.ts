import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Auth } from './core/auth';

/** An unauthenticated visitor at a protected route goes to /login?next=<path>. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.token) {
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  }
  try {
    await auth.load();
    return true;
  } catch {
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  }
};

/** A guest at a host route meets the ordinary not-found page. */
export const hostGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.token) {
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  }
  try { await auth.load(); } catch { /* handled by authGuard ordering */ }
  if (auth.account?.role !== 'host') {
    return router.parseUrl('/not-found');
  }
  return true;
};

export const publicGuard: CanActivateFn = () => true;
