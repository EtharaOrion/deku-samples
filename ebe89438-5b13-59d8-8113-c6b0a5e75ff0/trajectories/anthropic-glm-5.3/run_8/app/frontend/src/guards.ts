import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Api } from './api';

/** The path the visitor was actually trying to reach, captured before navigation commits. */
function attemptedPath(router: Router): string {
  const nav = router.getCurrentNavigation();
  const target = nav?.finalUrl?.toString() ?? nav?.initialUrl?.toString() ?? router.url;
  return target || '/';
}

function loginUrl(router: Router): ReturnType<Router['createUrlTree']> {
  return router.createUrlTree(['/login'], { queryParams: { next: attemptedPath(router) } });
}

/** Any signed-in account. */
export const authed: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  await api.settled();
  if (!api.account()) return loginUrl(router);
  return true;
};

/** A host alone; a guest meets the not-found page, never a refusal that leaks. */
export const hostOnly: CanActivateFn = async () => {
  const api = inject(Api);
  const router = inject(Router);
  await api.settled();
  const acct = api.account();
  if (!acct) return loginUrl(router);
  if (acct.role !== 'host') return router.createUrlTree(['/not-found']);
  return true;
};
