import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { SessionService } from './session.service';

/**
 * An unauthenticated visitor at a protected route goes to /login?next=<path>.
 * A signed-in visitor who may not see a route is not sent elsewhere: the route
 * renders the ordinary not-found page itself, because wording or an address
 * that differed would confirm which records exist.
 */
export const authGuard: CanActivateFn = async (_route, stateSnapshot): Promise<boolean | UrlTree> => {
  const session = inject(SessionService);
  const router = inject(Router);
  await session.restore();
  if (session.signedIn()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: stateSnapshot.url } });
};
