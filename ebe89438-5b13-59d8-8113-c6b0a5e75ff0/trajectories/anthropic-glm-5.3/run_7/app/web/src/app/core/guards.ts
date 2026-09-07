import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Api } from './api';
import { map, catchError, of } from 'rxjs';

/** Waits until the session is known before deciding about a protected route. */
function whenKnown(api: Api, then: () => boolean | UrlTree) {
  return api.loadAccount().pipe(map(() => then()));
}

export const authGuard: CanActivateFn = (_route, state) => {
  const api = inject(Api);
  const router = inject(Router);
  return whenKnown(api, () => {
    if (api.signedIn()) return true;
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  });
};

export const hostGuard: CanActivateFn = (_route, state) => {
  const api = inject(Api);
  const router = inject(Router);
  return whenKnown(api, () => {
    if (api.isHost()) return true;
    // A guest sees the not-found page, not a refusal naming the record.
    return router.createUrlTree(['/not-found']);
  });
};

export const guestOnly: CanActivateFn = () => {
  const api = inject(Api);
  const router = inject(Router);
  return whenKnown(api, () => {
    if (!api.signedIn()) return true;
    return router.createUrlTree([api.isHost() ? '/calendars' : '/home']);
  });
};

/** Root-namespace lookups that resolve to nothing render the not-found page. */
export const notFoundGuard: CanActivateFn = (route) => {
  const api = inject(Api);
  const router = inject(Router);
  const slug = String(route.params['slug'] ?? '');
  return api.resolve(slug).pipe(
    map((r) => {
      if (r.kind === 'not_found') return router.createUrlTree(['/not-found']);
      return true;
    }),
    catchError(() => of(true)),
  );
};
