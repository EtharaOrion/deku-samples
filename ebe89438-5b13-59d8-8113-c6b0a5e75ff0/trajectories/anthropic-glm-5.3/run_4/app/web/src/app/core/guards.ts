import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { AuthService } from './auth.service';

function loginTree(): UrlTree {
  const router = inject(Router);
  const path = router.getCurrentNavigation()?.finalUrl?.toString() ?? router.url;
  return router.createUrlTree(['/login'], { queryParams: { next: path } });
}

/** Unauthenticated visitors at protected routes are sent to /login?next=<path>. */
export async function authGuard(): Promise<boolean | UrlTree> {
  const auth = inject(AuthService);
  auth.restore();
  const acc = await auth.whenAccount();
  if (acc) return true;
  return loginTree();
}

/** A guest at a host route meets the not-found page, not a refusal. */
export async function hostGuard(): Promise<boolean | UrlTree> {
  const auth = inject(AuthService);
  auth.restore();
  const acc = await auth.whenAccount();
  if (!acc) return loginTree();
  if (acc.role !== 'host') return inject(Router).createUrlTree(['/404']);
  return true;
}
