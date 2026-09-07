import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';

/** An unauthenticated visitor at a protected route goes to /login?next=<path>. */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (api.isSignedIn) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** A guest at /calendars or a manage route gets the not-found page, never a
 *  message that would confirm the record exists. */
export const hostGuard: CanActivateFn = (_route, state) => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (!api.isSignedIn) {
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  }
  if (api.account()?.role !== 'host') {
    return router.createUrlTree(['/not-found']);
  }
  return true;
};
