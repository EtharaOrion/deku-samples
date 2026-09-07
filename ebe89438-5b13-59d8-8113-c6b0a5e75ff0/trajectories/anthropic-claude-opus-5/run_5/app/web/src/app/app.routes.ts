import { Routes } from '@angular/router';
import { hostGuard, signedInGuard } from './core/guards';

/**
 * The root namespace resolves with one fixed precedence, so `/<slug>` sits last
 * in the table and every reserved path sits above it.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./routes/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'discover',
    loadComponent: () => import('./routes/discover.page').then((m) => m.DiscoverPage),
  },
  { path: 'login', loadComponent: () => import('./routes/auth.page').then((m) => m.SignInPage) },
  { path: 'signup', loadComponent: () => import('./routes/auth.page').then((m) => m.SignUpPage) },
  {
    path: 'app',
    loadComponent: () => import('./routes/get-the-app.page').then((m) => m.GetTheAppPage),
  },
  { path: 'terms', loadComponent: () => import('./routes/legal.page').then((m) => m.LegalPage) },
  {
    path: 'suspended',
    loadComponent: () => import('./routes/suspended.page').then((m) => m.SuspendedPage),
  },
  { path: 't/:code', loadComponent: () => import('./routes/ticket.page').then((m) => m.TicketPage) },
  {
    path: 'home',
    canActivate: [signedInGuard],
    loadComponent: () => import('./routes/home.page').then((m) => m.HomePage),
  },
  {
    path: 'settings/profile',
    canActivate: [signedInGuard],
    loadComponent: () => import('./routes/settings.page').then((m) => m.SettingsPage),
  },
  { path: 'settings', pathMatch: 'full', redirectTo: 'settings/profile' },
  {
    path: 'calendars',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/calendars.page').then((m) => m.CalendarsPage),
  },
  {
    path: 'create',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/create.page').then((m) => m.CreatePage),
  },
  {
    path: 'event/:slug/manage',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/manage.shell').then((m) => m.ManageShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'overview' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./routes/manage-overview.page').then((m) => m.ManageOverviewPage),
      },
      {
        path: 'guests',
        loadComponent: () => import('./routes/manage-guests.page').then((m) => m.ManageGuestsPage),
      },
      {
        path: 'registration',
        loadComponent: () =>
          import('./routes/manage-registration.page').then((m) => m.ManageRegistrationPage),
      },
    ],
  },
  {
    path: 'not-found',
    loadComponent: () => import('./routes/not-found.page').then((m) => m.NotFoundPage),
  },
  {
    // One lookup with fixed precedence resolves the rest of the namespace.
    path: ':slug',
    loadComponent: () => import('./routes/resolve.page').then((m) => m.ResolvePage),
  },
  { path: '**', loadComponent: () => import('./routes/not-found.page').then((m) => m.NotFoundPage) },
];
