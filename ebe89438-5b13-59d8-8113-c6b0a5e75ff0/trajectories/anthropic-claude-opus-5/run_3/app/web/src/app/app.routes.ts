import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { SessionService } from './core/session.service';
import { AppShellComponent } from './layout/app-shell.component';

/**
 * An unauthenticated visitor at a protected route goes to /login?next=<path>.
 */
async function requireSignedIn(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
  const session = inject(SessionService);
  const router = inject(Router);
  await session.restore();
  if (session.isSignedIn()) return true;
  return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
}

/**
 * A guest at /calendars or a manage route gets the not-found page, because
 * wording that differed would confirm the record exists.
 */
async function requireHost(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
  const session = inject(SessionService);
  const router = inject(Router);
  await session.restore();
  if (!session.isSignedIn()) {
    return router.createUrlTree(['/login'], { queryParams: { next: state.url } });
  }
  if (!session.isHost()) return router.createUrlTree(['/not-found']);
  return true;
}

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./routes/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'discover',
    loadComponent: () => import('./routes/discover.component').then((m) => m.DiscoverComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./routes/auth.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () => import('./routes/auth.component').then((m) => m.SignupComponent),
  },
  {
    path: 'app',
    loadComponent: () => import('./routes/system.component').then((m) => m.GetTheAppComponent),
  },
  {
    path: 'terms',
    loadComponent: () => import('./routes/system.component').then((m) => m.LegalComponent),
  },
  {
    path: 'suspended',
    loadComponent: () => import('./routes/system.component').then((m) => m.SuspendedComponent),
  },
  {
    path: 'not-found',
    loadComponent: () => import('./routes/system.component').then((m) => m.NotFoundComponent),
  },
  {
    path: 't/:code',
    loadComponent: () => import('./routes/ticket.component').then((m) => m.TicketComponent),
  },
  {
    path: '',
    component: AppShellComponent,
    children: [
      {
        path: 'home',
        canActivate: [requireSignedIn],
        loadComponent: () => import('./routes/home.component').then((m) => m.HomeComponent),
      },
      {
        path: 'settings/profile',
        canActivate: [requireSignedIn],
        loadComponent: () => import('./routes/settings.component').then((m) => m.SettingsProfileComponent),
      },
      {
        path: 'calendars',
        canActivate: [requireHost],
        loadComponent: () => import('./routes/calendars.component').then((m) => m.CalendarsComponent),
      },
      {
        path: 'create',
        canActivate: [requireHost],
        loadComponent: () => import('./routes/create.component').then((m) => m.CreateEventComponent),
      },
      {
        path: 'event/:slug/manage',
        canActivate: [requireHost],
        loadComponent: () => import('./routes/manage.component').then((m) => m.ManageComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            loadComponent: () => import('./routes/manage-overview.component').then((m) => m.ManageOverviewComponent),
          },
          {
            path: 'guests',
            loadComponent: () => import('./routes/manage-guests.component').then((m) => m.ManageGuestsComponent),
          },
          {
            path: 'registration',
            loadComponent: () =>
              import('./routes/manage-registration.component').then((m) => m.ManageRegistrationComponent),
          },
        ],
      },
    ],
  },
  {
    // Root-namespace resolution: one lookup with fixed precedence.
    path: ':slug',
    loadComponent: () => import('./routes/resolve.component').then((m) => m.ResolveComponent),
  },
  { path: '**', loadComponent: () => import('./routes/system.component').then((m) => m.NotFoundComponent) },
];
