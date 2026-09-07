import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

async function ready(auth: AuthService) {
  if (!auth.ready()) await auth.restore();
}

/** An unauthenticated visitor at a protected route goes to /login?next=<path>. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await ready(auth);
  if (auth.isSignedIn()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** A guest at /calendars or a manage route gets the not-found page. */
export const hostGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await ready(auth);
  if (!auth.isSignedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  }
  if (auth.isHost()) return true;
  return router.createUrlTree(['/404']);
};
