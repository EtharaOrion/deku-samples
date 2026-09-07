import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';

/** An unauthenticated visitor at a protected route goes to /login?next=<path>. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (!api.bootstrapped()) await api.loadMe();
  if (api.account()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** A guest at /calendars or a manage route gets the ordinary not-found page. */
export const hostGuard: CanActivateFn = async (_route, state) => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (!api.bootstrapped()) await api.loadMe();
  const acc = api.account();
  if (!acc) return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  if (acc.role !== 'host') return router.parseUrl('/not-found');
  return true;
};
