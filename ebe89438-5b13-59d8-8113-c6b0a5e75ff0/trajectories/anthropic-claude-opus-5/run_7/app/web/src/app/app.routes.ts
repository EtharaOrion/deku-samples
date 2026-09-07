import { Routes } from '@angular/router';
import { hostGuard, signedInGuard } from './core/guards';

/**
 * Routing mirrors the root-namespace precedence: the reserved system paths and
 * the twelve category names are declared first, and the single-segment
 * catch-all resolves an event, a calendar or an account handle after them.
 */
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
    loadComponent: () => import('./routes/get-app.component').then((m) => m.GetAppComponent),
  },
  {
    path: 'home',
    canActivate: [signedInGuard],
    loadComponent: () => import('./routes/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'calendars',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/calendars.component').then((m) => m.CalendarsComponent),
  },
  {
    path: 'create',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/create.component').then((m) => m.CreateComponent),
  },
  {
    path: 'settings/profile',
    canActivate: [signedInGuard],
    loadComponent: () => import('./routes/settings.component').then((m) => m.SettingsComponent),
  },
  { path: 'settings', redirectTo: 'settings/profile', pathMatch: 'full' },
  {
    path: 'event/:slug/manage',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/manage/manage.component').then((m) => m.ManageComponent),
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        loadComponent: () => import('./routes/manage/overview.component').then((m) => m.ManageOverviewComponent),
      },
      {
        path: 'guests',
        loadComponent: () => import('./routes/manage/guests.component').then((m) => m.ManageGuestsComponent),
      },
      {
        path: 'registration',
        loadComponent: () => import('./routes/manage/registration.component').then((m) => m.ManageRegistrationComponent),
      },
    ],
  },
  {
    path: 't/:code',
    loadComponent: () => import('./routes/ticket.component').then((m) => m.TicketComponent),
  },
  {
    path: 'suspended',
    loadComponent: () => import('./routes/system.component').then((m) => m.SuspendedComponent),
  },
  {
    path: 'terms',
    loadComponent: () => import('./routes/system.component').then((m) => m.LegalComponent),
  },
  {
    path: 'not-found',
    loadComponent: () => import('./routes/system.component').then((m) => m.NotFoundComponent),
  },
  {
    // The single-segment catch-all: a category, an event, a calendar or an
    // account handle, resolved in that fixed precedence.
    path: ':slug',
    loadComponent: () => import('./routes/resolve.component').then((m) => m.ResolveComponent),
  },
  {
    path: '**',
    loadComponent: () => import('./routes/system.component').then((m) => m.NotFoundComponent),
  },
];
