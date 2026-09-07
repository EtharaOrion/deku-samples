import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

/** An unauthenticated visitor at a protected route goes to /login?next=<path>. */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (auth.signedIn()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** A guest at /calendars or a manage route gets the not-found page. */
export const hostGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.signedIn())
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  if (!auth.isHost()) return router.createUrlTree(['/not-found']);
  return true;
};
