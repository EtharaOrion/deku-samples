import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { ApiService } from './api.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (api.token()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

export const hostGuard: CanActivateFn = (_route, state) => {
  const api = inject(ApiService);
  const router = inject(Router);
  if (!api.token()) return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  if (api.isHost()) return true;
  // A guest at a host route meets the not-found page, not a permission message.
  return router.createUrlTree(['/not-found']);
};
