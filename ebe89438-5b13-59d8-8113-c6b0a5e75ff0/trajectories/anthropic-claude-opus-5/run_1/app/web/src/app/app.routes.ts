import { Routes } from '@angular/router';
import { hostGuard, signedInGuard } from './core/guards';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./routes/landing').then((m) => m.LandingRoute),
    title: 'Deku — events start here',
  },
  {
    path: 'discover',
    loadComponent: () => import('./routes/discover').then((m) => m.DiscoverRoute),
    title: 'Discover Events — Deku',
  },
  {
    path: 'login',
    loadComponent: () => import('./routes/auth-routes').then((m) => m.LoginRoute),
    title: 'Sign In — Deku',
  },
  {
    path: 'signup',
    loadComponent: () => import('./routes/auth-routes').then((m) => m.SignupRoute),
    title: 'Create An Account — Deku',
  },
  {
    path: 'app',
    loadComponent: () => import('./routes/public-pages').then((m) => m.GetAppRoute),
    title: 'Get the App — Deku',
  },
  {
    path: 'legal',
    loadComponent: () => import('./routes/public-pages').then((m) => m.LegalRoute),
    title: 'Terms and Privacy — Deku',
  },
  {
    path: 'suspended',
    loadComponent: () => import('./routes/public-pages').then((m) => m.SuspendedRoute),
    title: 'Account Suspended — Deku',
  },
  {
    path: 'not-found',
    loadComponent: () => import('./routes/public-pages').then((m) => m.NotFoundRoute),
    title: '404 · Page Not Found — Deku',
  },
  {
    path: 'home',
    canActivate: [signedInGuard],
    loadComponent: () => import('./routes/home').then((m) => m.HomeRoute),
    title: 'Your Events — Deku',
  },
  {
    path: 'settings/profile',
    canActivate: [signedInGuard],
    loadComponent: () => import('./routes/settings').then((m) => m.SettingsProfileRoute),
    title: 'Profile — Deku',
  },
  {
    path: 'calendars',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/calendars').then((m) => m.CalendarsRoute),
    title: 'Your Calendars — Deku',
  },
  {
    path: 'create',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/create').then((m) => m.CreateRoute),
    title: 'Create Event — Deku',
  },
  {
    path: 'event/:slug/manage/overview',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/manage').then((m) => m.ManageOverviewRoute),
  },
  {
    path: 'event/:slug/manage/guests',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/manage').then((m) => m.ManageGuestsRoute),
  },
  {
    path: 'event/:slug/manage/registration',
    canActivate: [hostGuard],
    loadComponent: () => import('./routes/manage').then((m) => m.ManageRegistrationRoute),
  },
  {
    path: 'event/:slug',
    redirectTo: 'event/:slug/manage/overview',
    pathMatch: 'full',
  },
  {
    path: 't/:code',
    loadComponent: () => import('./routes/ticket').then((m) => m.TicketRoute),
  },
  // the root namespace is the last word: one lookup with fixed precedence
  {
    path: ':slug',
    loadComponent: () => import('./routes/root-slug').then((m) => m.RootSlugRoute),
  },
  {
    path: '**',
    loadComponent: () => import('./routes/public-pages').then((m) => m.NotFoundRoute),
    title: '404 · Page Not Found — Deku',
  },
];
