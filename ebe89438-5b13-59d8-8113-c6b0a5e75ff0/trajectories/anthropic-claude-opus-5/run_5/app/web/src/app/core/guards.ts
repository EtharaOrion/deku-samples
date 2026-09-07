import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** An unauthenticated visitor at a protected route goes to /login?next=<path>. */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.signedIn()) return true;
  const next = state.url.split('?')[0];
  return router.createUrlTree(['/login'], { queryParams: next === '/' ? {} : { next } });
};

/**
 * A guest at /calendars or a manage route gets the not-found page, because
 * wording that differed would confirm a private record exists.
 */
export const hostGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.signedIn()) {
    const next = state.url.split('?')[0];
    return router.createUrlTree(['/login'], { queryParams: next === '/' ? {} : { next } });
  }
  if (!auth.isHost()) return router.createUrlTree(['/not-found']);
  return true;
};
